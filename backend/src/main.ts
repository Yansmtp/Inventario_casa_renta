import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, NestInterceptor, ExecutionContext, CallHandler, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { AppModule } from './app.module';
import helmet from 'helmet'; // <- cambio aquí
import { ConfigService } from '@nestjs/config';
import { resolveUploadsRoot } from './shared/utils/uploads-root';

@Injectable()
class LogoUrlInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const protocol = req.protocol;
    const host = req.get('host');

    const isPlainObject = (v: any) => v && typeof v === 'object' && v.constructor === Object;

    const normalize = (data: any): any => {
      // No tocar valores primitivos ni Date
      if (!data || typeof data !== 'object') return data;
      if (data instanceof Date) return data.toISOString();
      if (Array.isArray(data)) return data.map(normalize);

      // Solo recorrer objetos llanos (plain objects) para evitar romper clases/instancias
      if (!isPlainObject(data)) return data;

      const out: any = {};
      for (const key of Object.keys(data)) {
        const val = data[key];
        if (key === 'logo' && typeof val === 'string' && val.startsWith('/uploads')) {
          out[key] = `${protocol}://${host}${val}`;
        } else if (isPlainObject(val) || Array.isArray(val)) {
          out[key] = normalize(val);
        } else if (val instanceof Date) {
          out[key] = val.toISOString();
        } else {
          out[key] = val;
        }
      }
      return out;
    };

    return next.handle().pipe(map(data => normalize(data)));
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  // Seguridad
  // Aplicamos helmet y permitimos carga cross-origin de recursos estáticos
  app.use(helmet());
  try {
    app.use(helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }));
  } catch (e) {
    // En algunas versiones de helmet la función puede no existir; ignoramos si falla
    console.warn('crossOriginResourcePolicy no disponible en helmet:', e);
  }

  const frontendUrl = configService.get('FRONTEND_URL');

  // Orígenes extra configurables por entorno (separados por coma)
  const extraOrigins = String(configService.get('ADDITIONAL_ORIGINS') || '')
    .split(',')
    .map(o => o.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const allowedOrigins: Array<string | RegExp> = [
    ...(frontendUrl ? [String(frontendUrl).trim().replace(/\/$/, '')] : []),
    ...extraOrigins,
    // Cualquier dominio de Vercel: producción, previews y despliegues por rama
    /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i,
  ];

  if (process.env.NODE_ENV !== 'production') {
    // Desarrollo: cualquier localhost/127.0.0.1 en cualquier puerto
    allowedOrigins.push(/^https?:\/\/localhost(:\d+)?$/i);
    allowedOrigins.push(/^https?:\/\/127\.0\.0\.1(:\d+)?$/i);
  }

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return true; // Postman, apps móviles, curl, etc.
    const normalized = origin.trim().replace(/\/$/, '');
    return allowedOrigins.some(allowed =>
      typeof allowed === 'string'
        ? allowed.toLowerCase() === normalized.toLowerCase()
        : allowed.test(normalized),
    );
  };

  app.enableCors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        // Devolvemos el origen recibido (no un valor fijo) para que coincida siempre
        return callback(null, true);
      }
      console.warn(`[CORS] Origen bloqueado: ${origin}`);
      // No lanzamos error: simplemente no se envían cabeceras CORS (evita 500 en preflight)
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Authorization', 'Accept'],
    exposedHeaders: ['Content-Disposition'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400,
  });

  // Validación global
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));

  // Prefijo global
  app.setGlobalPrefix('api');

  // Asegurar que recursos servidos desde /uploads permitan ser cargados desde otros orígenes
  app.use('/uploads', (req, res, next) => {
    // Permitir uso cross-origin de recursos estáticos (para <img>, <link>, etc.)
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    // Reflejar el origen solicitante si está permitido (nunca un valor fijo)
    const requestOrigin = req.headers.origin as string | undefined;
    if (requestOrigin && isOriginAllowed(requestOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', requestOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    next();
  });

  // Servir carpeta uploads como estática en /uploads
  // Esto expone backend/uploads/* en http://HOST:PORT/uploads/*
  const uploadsRoot = resolveUploadsRoot(configService.get('UPLOAD_PATH', './uploads'));
  app.useStaticAssets(uploadsRoot, { prefix: '/uploads' });

  // Interceptor global: convierte rutas de 'logo' que empiezan con '/uploads' en URLs absolutas
  app.useGlobalInterceptors(new LogoUrlInterceptor());

  const port = configService.get('PORT', 3000);
  await app.listen(port);
  console.log(`🚀 Aplicación corriendo en: http://localhost:${port}`);
}
bootstrap();

