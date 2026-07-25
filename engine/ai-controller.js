import { chooseCpuMove } from './cpu.js';

export const CPU_CHOICES = new Set(['easy', 'normal', 'hard', 'alphasho']);
export const CPU_TIME_LIMITS = Object.freeze({ easy: 1200, normal: 2000, hard: 3500 });

export async function chooseAiMove({
  choice,
  position,
  legalMoves,
  strategy,
  repetitionEntries,
  alphaShoClient,
  alphaShoPreset = 'standard',
  signal = null,
  onFallback = null,
}) {
  if (choice !== 'alphasho') {
    return chooseCpuMove(position, choice, {
      timeLimitMs: CPU_TIME_LIMITS[choice] || CPU_TIME_LIMITS.normal,
      strategy,
    });
  }

  try {
    const result = await alphaShoClient.chooseMove({
      position,
      legalMoves,
      repetitionEntries,
      preset: alphaShoPreset,
      signal,
    });
    return result.move;
  } catch (error) {
    if (error?.name === 'AbortError' || error?.message === 'ALPHASHO_CANCELLED') throw error;
    onFallback?.(error);
    return chooseCpuMove(position, 'hard', {
      timeLimitMs: CPU_TIME_LIMITS.hard,
      strategy,
    });
  }
}
