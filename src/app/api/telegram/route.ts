// src/app/api/telegram/route.ts
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * Telegram Webhook Handler (Next.js App Router, TypeScript)
 * - Commands: /start, /click, /video, /ad, /done video, /done ad, /points, /guess
 * - Speichert User & Punkte in Supabase (Tabelle: users)
 *
 * ENV (Vercel / .env.local):
 *  TELEGRAM_BOT_TOKEN=12345:ABC...
 *  TELEGRAM_WEBHOOK_SECRET=super-secret   // wird beim setWebhook als secret_token gesetzt
 *  SUPABASE_URL=https://xxxx.supabase.co
 *  SUPABASE_SERVICE_ROLE_KEY=eyJ...       // NUR serverseitig!
 *  SUPABASE_ANON_KEY=eyJ...               // optional fallback (nur für dev)
 *  DRAWCOIN_VIDEO_URL=https://youtube.com/...
 *  DRAWCOIN_AD_URL=https://example.com/...
 */

// WICHTIG: Supabase JS benötigt Node-Runtime (nicht Edge)
export const runtime = 'nodejs';
// Falls du den Handler cachen willst – hier nicht sinnvoll, aber explizit:
export const dynamic = 'force-dynamic';

type TgUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  chat: { id: number; type: string; username?: string; first_name?: string; last_name?: string };
  from?: TgUser;
  entities?: Array<{ type: string; offset: number; length: number }>;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

// --- Utilities ---------------------------------------------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const TELEGRAM_BOT_TOKEN = requireEnv('TELEGRAM_BOT_TOKEN');
const TELEGRAM_WEBHOOK_SECRET = requireEnv('TELEGRAM_WEBHOOK_SECRET');
const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function tgSendMessage(chatId: number, text: string) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // parse_mode optional, hier plain text (sicher)
    body: JSON.stringify({ chat_id: chatId, text }),
    cache: 'no-store',
  });
  // Fehler protokollieren, aber den Webhook immer 200 antworten lassen
  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    console.error('Telegram sendMessage error:', res.status, errTxt);
  }
}

async function getUser(telegramId: number) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', String(telegramId))
    .maybeSingle();

  if (error) {
    console.error('getUser error:', error);
    return null;
  }
  return data as { telegram_id: string; points: number; created_at: string } | null;
}

async function createUser(telegramId: number) {
  const { data, error } = await supabase
    .from('users')
    .insert({
      telegram_id: String(telegramId),
      points: 0,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('createUser error:', error);
    return null;
  }
  return data as { telegram_id: string; points: number; created_at: string } | null;
}

async function ensureUser(telegramId: number) {
  let user = await getUser(telegramId);
  if (!user) user = await createUser(telegramId);
  return user;
}

// Standard-Update mit race condition (einfach)
// Tipp: Für produktiv einen Postgres RPC nutzen (s.u.)
async function updatePoints(telegramId: number, delta: number) {
  const user = await getUser(telegramId);
  const current = user?.points ?? 0;
  const newPts = current + delta;

  const { error } = await supabase
    .from('users')
    .update({ points: newPts })
    .eq('telegram_id', String(telegramId));

  if (error) console.error('updatePoints error:', error);
  return newPts;
}

// Optional: Race-free Variante via RPC (wenn du die Funktion erstellt hast)
// async function updatePointsRPC(telegramId: number, delta: number) {
//   const { data, error } = await supabase.rpc('increment_points_by_telegram_id', {
//     p_telegram_id: String(telegramId),
//     p_delta: delta,
//   });
//   if (error) {
//     console.error('updatePointsRPC error:', error);
//     return null;
//   }
//   return data as number; // new total
// }

// --- Temporärer Memory-Store (nur für lokale Dev geeignet) -------------------
// Achtung: In Serverless (Vercel) NICHT zuverlässig! Besser: Supabase-Tabelle.
type PendingTask = { type: 'video' | 'ad' | 'guess'; number?: number };
declare global {
  // eslint-disable-next-line no-var
  var __DRAW_PENDING_TASKS__: Record<string, PendingTask> | undefined;
}
if (!global.__DRAW_PENDING_TASKS__) global.__DRAW_PENDING_TASKS__ = {};
const pendingTasks = global.__DRAW_PENDING_TASKS__;

// --- Handler -----------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // 1) Webhook-Secret prüfen (genauer Header-Name von Telegram)
    // setWebhook: secret_token -> Telegram sendet Header: X-Telegram-Bot-Api-Secret-Token
    const secretHeader = request.headers.get('x-telegram-bot-api-secret-token');
    if (secretHeader !== TELEGRAM_WEBHOOK_SECRET) {
      // Telegram erwartet 200, aber wir geben 403 für unautorisierte
      return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
    }

    // 2) Body parsen
    const update = (await request.json()) as TelegramUpdate;
    const message = update?.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = message.chat?.id;
    const text = (message.text || '').trim();

    if (!chatId) return NextResponse.json({ ok: true });

    // 3) Pending tasks lookup
    const key = String(chatId);
    const pending = pendingTasks[key];

    // 4) Guess-Modus: jede Zahl als Versuch werten
    if (pending?.type === 'guess') {
      const guess = parseInt(text, 10);
      if (!Number.isNaN(guess)) {
        if (guess === pending.number) {
          const total = await updatePoints(chatId, 2);
          delete pendingTasks[key];
          await tgSendMessage(chatId, `Correct! You earned 2 points.\nTotal points: ${total}.`);
        } else {
          await tgSendMessage(chatId, 'Wrong guess, try again!');
        }
      } else {
        await tgSendMessage(chatId, 'Please reply with a number between 1 and 5.');
      }
      return NextResponse.json({ ok: true });
    }

    // 5) Commands
    if (text.startsWith('/start')) {
      const user = await ensureUser(chatId);
      const pts = user?.points ?? 0;
      await tgSendMessage(
        chatId,
        [
          `Welcome to DRAW Bot!`,
          `Your current points: ${pts}`,
          ``,
          `Commands:`,
          `/click – daily click (+1)`,
          `/video – watch a video (+5)`,
          `/ad – visit an ad (+3)`,
          `/points – show points`,
          `/guess – mini-game (guess 1–5 for +2)`,
        ].join('\n')
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/points')) {
      const user = await ensureUser(chatId);
      await tgSendMessage(chatId, `You have ${user?.points ?? 0} points.`);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/click')) {
      const total = await updatePoints(chatId, 1);
      await tgSendMessage(chatId, `Thanks for clicking! +1 point.\nTotal points: ${total}.`);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/video')) {
      pendingTasks[key] = { type: 'video' };
      const videoUrl =
        process.env.DRAWCOIN_VIDEO_URL || 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
      await tgSendMessage(
        chatId,
        `Watch this video: ${videoUrl}\nSend /done video when finished to claim points.`
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/ad')) {
      pendingTasks[key] = { type: 'ad' };
      const adUrl = process.env.DRAWCOIN_AD_URL || 'https://example.com/ad';
      await tgSendMessage(
        chatId,
        `Visit this ad: ${adUrl}\nSend /done ad when done to claim points.`
      );
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/done video') || text.startsWith('/done ad')) {
      const doneType: 'video' | 'ad' = text.includes('video') ? 'video' : 'ad';
      const current = pendingTasks[key];
      if (current?.type === doneType) {
        const pts = doneType === 'video' ? 5 : 3;
        const total = await updatePoints(chatId, pts);
        delete pendingTasks[key];
        await tgSendMessage(chatId, `Thanks! You earned ${pts} points.\nTotal points: ${total}.`);
      } else {
        await tgSendMessage(
          chatId,
          `You have no pending ${doneType} task. Use /${doneType} to start one.`
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/guess')) {
      const num = Math.floor(Math.random() * 5) + 1;
      pendingTasks[key] = { type: 'guess', number: num };
      await tgSendMessage(chatId, 'Guess a number between 1 and 5. Reply with your guess.');
      return NextResponse.json({ ok: true });
    }

    // Fallback
    await tgSendMessage(chatId, 'Unknown command. Send /start to see available commands.');
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Webhook error:', e?.message || e);
    // Telegram erwartet 200er; wenn 500, versucht es erneut
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
