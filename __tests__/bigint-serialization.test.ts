import { describe, it, expect } from 'vitest';
import '@/lib/bigint-serialization';

describe('serialización de BigInt', () => {
  it('JSON.stringify convierte BigInt a string en vez de lanzar', () => {
    expect(JSON.stringify({ messageUid: 123n })).toBe('{"messageUid":"123"}');
  });

  it('funciona anidado', () => {
    const value = { invoice: { messageUid: 9007199254740993n } };
    expect(JSON.stringify(value)).toBe(
      '{"invoice":{"messageUid":"9007199254740993"}}'
    );
  });
});
