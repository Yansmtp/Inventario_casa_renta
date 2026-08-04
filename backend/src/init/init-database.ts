import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);

  try {
    // Crear usuario admin por defecto
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    const admin = await prisma.user.upsert({
      where: { email: 'admin@oasis.com' },
      update: {},
      create: {
        email: 'admin@oasis.com',
        name: 'Administrador',
        password: hashedPassword,
        role: 'ADMIN',
      },
    });

    console.log('✅ Usuario admin creado/actualizado:', admin.email);

    // Crear empresa por defecto
    const company = await prisma.company.upsert({
      where: { id: 1 },
      update: {},
      create: {
        name: 'Oasis Guest House',
        lowStockThreshold: 10,
      },
    });

    console.log('✅ Empresa creada/actualizada:', company.name);

    // Crear moneda USD por defecto
    const currency = await prisma.currencyRate.upsert({
      where: { id: 1 },
      update: {},
      create: {
        code: 'USD',
        rate: 1,
        effectiveFrom: new Date(),
      },
    });

    console.log('✅ Moneda USD creada/actualizada');

    console.log('✅ Base de datos inicializada correctamente');
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();