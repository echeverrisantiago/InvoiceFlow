import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateOpenRouterContent } from '@/lib/openrouter';

function mockResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as any;
}

describe('generateOpenRouterContent', () => {
  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    vi.stubEnv('OPENROUTER_MODEL', 'google/gemini-3.5-flash');
    vi.stubEnv(
      'OPENROUTER_FALLBACK_MODELS',
      'google/gemini-3.1-flash-lite'
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envía el PDF de forma nativa y fuerza JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      mockResponse(200, {
        choices: [
          {
            message: { content: '{"isInvoice":true}' },
            finish_reason: 'stop',
          },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateOpenRouterContent([
      { text: 'Extrae' },
      { inlineData: { mimeType: 'application/pdf', data: 'UERG' } },
    ]);

    expect(text).toBe('{"isInvoice":true}');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer test-key');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('google/gemini-3.5-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.reasoning).toEqual({ effort: 'minimal', exclude: true });
    expect(body.plugins).toEqual([
      { id: 'file-parser', pdf: { engine: 'native' } },
    ]);
    expect(body.messages[0].content).toEqual([
      { type: 'text', text: 'Extrae' },
      {
        type: 'file',
        file: {
          filename: 'documento.pdf',
          file_data: 'data:application/pdf;base64,UERG',
        },
      },
    ]);
  });

  it('prueba el modelo de respaldo si el principal da 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        mockResponse(404, { error: { message: 'model not found' } })
      )
      .mockResolvedValueOnce(
        mockResponse(200, {
          choices: [
            {
              message: { content: '{"ok":true}' },
              finish_reason: 'stop',
            },
          ],
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const text = await generateOpenRouterContent([{ text: 'Extrae' }]);

    expect(text).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe(
      'google/gemini-3.1-flash-lite'
    );
  });

  it('no reintenta un 402 sin saldo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        mockResponse(402, { error: { message: 'Insufficient credits' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      generateOpenRouterContent([{ text: 'Extrae' }])
    ).rejects.toMatchObject({
      name: 'OpenRouterError',
      status: 402,
      retryable: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
