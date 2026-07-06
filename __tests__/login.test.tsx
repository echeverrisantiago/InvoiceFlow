import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock de Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

// Mock de Supabase client
const mockSignInWithPassword = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
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

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(mockSignInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });
  });

  it('muestra toast de éxito cuando las credenciales son correctas', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'test_token' } },
      error: null,
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('¡Bienvenido de nuevo!');
    });
  });

  it('muestra toast de error cuando las credenciales son incorrectas', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByLabelText('Email'), 'wrong@example.com');
    await user.type(screen.getByLabelText('Contraseña'), 'wrongpassword');
    await user.click(screen.getByRole('button', { name: 'Iniciar Sesión' }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Invalid login credentials');
    });
  });

  it('deshabilita el botón y muestra texto de carga durante el login', async () => {
    mockSignInWithPassword.mockImplementationOnce(
      () => new Promise(resolve => setTimeout(() => resolve({ data: { session: null }, error: null }), 200))
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
