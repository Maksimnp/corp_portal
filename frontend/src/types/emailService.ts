// app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
// import { emailService } from '@/services/emailService';
import { v4 as uuidv4 } from 'uuid';

// In-memory storage for reset tokens (в продакшене используйте базу данных)
const resetTokens = new Map();

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    // Валидация email
    if (!email || !email.endsWith('@minskhleb.by')) {
      return NextResponse.json(
        { error: 'Только корпоративная почта @minskhleb.by разрешена' },
        { status: 400 }
      );
    }

    // Генерация токена
    const resetToken = uuidv4();
    const tokenExpiry = Date.now() + 60 * 60 * 1000; // 1 час

    // Сохранение токена (временное решение)
    resetTokens.set(resetToken, {
      email,
      expires: tokenExpiry,
      used: false
    });

    // Отправка email
    // const emailSent = await emailService.sendPasswordResetEmail(email, resetToken);

    // if (!emailSent) {
    //   return NextResponse.json(
    //     { error: 'Ошибка при отправке письма. Попробуйте позже.' },
    //     { status: 500 }
    //   );
    // }

    return NextResponse.json({
      message: 'Инструкции по восстановлению пароля отправлены на вашу почту',
      success: true
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json(
      { error: 'Внутренняя ошибка сервера' },
      { status: 500 }
    );
  }
}

// Функция для проверки токена (для страницы сброса пароля)
export function validateResetToken(token: string): string | null {
  const tokenData = resetTokens.get(token);
  
  if (!tokenData) return null;
  if (tokenData.used) return null;
  if (Date.now() > tokenData.expires) return null;
  
  return tokenData.email;
}