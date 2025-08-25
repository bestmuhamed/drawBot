"use client";

import { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// Supabase client only for frontend (public keys)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function BotDashboard() {
  const [telegramId, setTelegramId] = useState('');
  const [loading, setLoading] = useState(false);
  const [points, setPoints] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPoints(null);
    if (!telegramId) {
      setError('Please enter your Telegram ID');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('users')
      .select('points')
      .eq('telegram_id', telegramId)
      .single();

    if (error || !data) {
      setError('User not found or database error');
    } else {
      setPoints(data.points);
    }
    setLoading(false);
  }

  return (
    <div className="container">
      <h1>DRAW Coin Bot Dashboard</h1>
      <p>Enter your Telegram ID to check your current points.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Telegram ID"
          value={telegramId}
          onChange={(e) => setTelegramId(e.target.value)}
        />
        <button type="submit" disabled={loading}>Check Points</button>
      </form>

      {error && <div className="msg">{error}</div>}
      {points !== null && (
        <div className="msg">Your current points: {points}</div>
      )}

      <hr style={{ margin: '2rem 0' }} />

      <h2>How to use the Bot</h2>
      <ul>
        <li>Start chat: send <code>/start</code></li>
        <li>Daily click: <code>/click</code> (+1 point)</li>
        <li>Watch a video: <code>/video</code>, then <code>/done video</code> (+5 points)</li>
        <li>Visit an ad: <code>/ad</code>, then <code>/done ad</code> (+3 points)</li>
        <li>Guess game: <code>/guess</code> then guess a number 1–5 (+2 points if correct)</li>
        <li>Check points in Telegram: <code>/points</code></li>
      </ul>
    </div>
  );
}
