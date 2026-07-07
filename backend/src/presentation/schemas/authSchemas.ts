import { z } from 'zod';

export const loginSchema = z.object({
  login: z.string().min(3).optional(),
  matricula: z.string().min(3).optional(),
  email: z.string().email().optional(),
  senha: z.string().min(1),
  lembrar: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (!value.login && !value.matricula && !value.email) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['login'],
      message: 'login, matricula ou email é obrigatório',
    });
  }
});

export const forgotSchema = z.object({
  login: z.string().min(3),
});

export const verifyCodeSchema = z.object({
  login: z.string().min(3),
  codigo: z.string().regex(/^\d{6}$/, 'Código deve ter 6 dígitos'),
});

export const resetPasswordSchema = z.object({
  resetToken: z.string().min(8),
  novaSenha: z.string().min(8),
});

export const changePasswordSchema = z.object({
  senhaAtual: z.string().min(1),
  novaSenha: z.string().min(8),
});
