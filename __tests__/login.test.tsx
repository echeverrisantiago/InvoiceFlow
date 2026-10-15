import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocks hoisteados para poder inspeccionarlos desde los tests.
const { mockPush, mockRefresh, mockSignOut, mockSignInWithPassword } = vi.hoisted(
  () => ({
    mockPush: vi.fn(),
    mockRefresh: vi.fn(),
    mockSignOut: vi.fn(),
    mockSignInWithPassword: vi.fn(),
  })
);

// Mock de Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock de Supabase client
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
  }),
}));

// Mock de sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import LoginPage from '@/app/login/page';
import { toast } from 'sonner';

const TRIAL_OK = { trialStatus: 'active', requiresPasswordChange: false };

function mockTrialResponse(response: {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: response.ok,
      status: response.status,
      json: response.json ?? (async () => ({})),
    })
  );
}

async function submitLogin(email = 'test@example.com', password = 'password123') {
  const user = userEvent.setup();
  render(<LoginPage />);

  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockSignOut.mockResolvedValue({ error: null });

    // El login consulta /api/auth/trial-status; por defecto responde OK.
    mockTrialResponse({ ok: true, status: 200, json: async () => TRIAL_OK });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renderiza el título y descripción correctamente', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { name: 'Iniciar Sesión' })).toBeInTheDocument();
    expect(screen.getByText(/Ingresa tu email y contraseña/i)).toBeInTheDocument();
  });

  it('renderiza los campos del formulario', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).toBeInTheDocument();
  });

  it('muestra link a la página de registro', () => {
    render(<LoginPage />);
    const registerLink = screen.getByRole('link', { name: /Regístrate aquí/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('el botón está habilitado por defecto', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).not.toBeDisabled();
  });

  it('llama a signInWithPassword con las credenciales correctas al hacer submit', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });

    await submitLogin();

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    // Esperar a que el flujo completo termine para no dejar navegaciones pendientes.
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('muestra toast de éxito y redirige al dashboard cuando las credenciales son correctas', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });

    await submitLogin();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('¡Bienvenido de nuevo!');
    });
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('muestra toast de error cuando las credenciales son incorrectas', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    await submitLogin('wrong@example.com', 'wrongpassword');

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid login credentials');
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('redirige a /change-password cuando se requiere cambiar la contraseña', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });
    mockTrialResponse({
      ok: true,
      status: 200,
      json: async () => ({ trialStatus: 'active', requiresPasswordChange: true }),
    });

    await submitLogin();

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/change-password');
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('cierra sesión y muestra error si falla la verificación del trial', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });
    mockTrialResponse({ ok: false, status: 500 });

    await submitLogin();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'Error al verificar el estado de la cuenta'
      );
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('cierra sesión y avisa cuando la contraseña temporal expiró', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });
    mockTrialResponse({
      ok: true,
      status: 200,
      json: async () => ({ trialStatus: 'expired' }),
    });

    await submitLogin();

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('expirado')
      );
    });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('permite el login cuando el trial-status responde 404', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });
    mockTrialResponse({ ok: false, status: 404 });

    await submitLogin();

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('¡Bienvenido de nuevo!');
    });
    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('deshabilita el botón y muestra texto de carga durante el login', async () => {
    mockSignInWithPassword.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: { session: null }, error: null }), 200)
        )
    );

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(screen.getByRole('button', { name: /Iniciando sesión.../i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Iniciar Sesión' })).not.toBeDisabled();
    });
  });

  it('no llama a signInWithPassword sin ingresar credenciales', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    // Click sin ingresar datos - el input required del browser previene el submit
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    expect(mockSignInWithPassword).not.toHaveBeenCalled();
  });
});
