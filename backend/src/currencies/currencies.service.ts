import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../shared/prisma/prisma.service';
import { Prisma } from '@prisma/client';

declare const fetch: any;

export interface CurrencyEntry {
  code: string;
  name: string;
  rate: number; // USD per 1 unit of currency (base USD)
  effectiveFrom?: Date;
  isDefault?: boolean;
}

@Injectable()
export class CurrenciesService {
  constructor(private prisma: PrismaService) {}

  private filePath = join(__dirname, '..', '..', '..', 'config', 'currencies.json');

  private async readFile(): Promise<CurrencyEntry[]> {
    const raw = await fs.readFile(this.filePath, 'utf8');
    return JSON.parse(raw) as CurrencyEntry[];
  }

  private normalizeCode(code: string): string {
    return String(code || '').trim().toUpperCase();
  }

  private sanitizeList(list: CurrencyEntry[]): CurrencyEntry[] {
    return list.filter(c => this.normalizeCode(c.code) !== 'EUR');
  }

  private async writeFile(data: CurrencyEntry[]) {
    await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private async getLatestRates(codes: string[]) {
    if (!codes.length) return new Map<string, { rate: number; effectiveFrom: Date }>();

    const rows = await this.prisma.currencyRate.findMany({
      where: { code: { in: codes } },
      orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
    });

    const map = new Map<string, { rate: number; effectiveFrom: Date }>();
    for (const row of rows) {
      if (!map.has(row.code)) {
        map.set(row.code, {
          rate: row.rate instanceof Prisma.Decimal ? row.rate.toNumber() : (row.rate as any),
          effectiveFrom: row.effectiveFrom,
        });
      }
    }
    return map;
  }

  async getAll(): Promise<CurrencyEntry[]> {
    const list = this.sanitizeList(await this.readFile());
    const codes = list.map(c => c.code);
    const latestRates = await this.getLatestRates(codes);

    return list.map(c => {
      const latest = latestRates.get(c.code);
      return {
        ...c,
        rate: latest?.rate ?? c.rate ?? (c.code === 'USD' ? 1 : 1),
        effectiveFrom: latest?.effectiveFrom,
      };
    });
  }

  async get(code: string): Promise<CurrencyEntry | null> {
    const normalizedCode = this.normalizeCode(code);
    const list = this.sanitizeList(await this.readFile());
    const entry = list.find(c => this.normalizeCode(c.code) === normalizedCode) || null;
    if (!entry) return null;

    const latestRates = await this.getLatestRates([normalizedCode]);
    const latest = latestRates.get(normalizedCode);

    return {
      ...entry,
      rate: latest?.rate ?? entry.rate ?? (normalizedCode === 'USD' ? 1 : 1),
      effectiveFrom: latest?.effectiveFrom,
    };
  }

  async updateRate(code: string, rate: number) {
    const normalizedCode = this.normalizeCode(code);
    if (normalizedCode === 'EUR') {
      throw new BadRequestException('EUR está deshabilitada temporalmente');
    }

    const list = this.sanitizeList(await this.readFile());
    const idx = list.findIndex(c => this.normalizeCode(c.code) === normalizedCode);
    if (idx === -1) throw new NotFoundException('Currency not found');

    await this.prisma.currencyRate.create({
      data: {
        code: normalizedCode,
        rate,
        effectiveFrom: new Date(),
      },
    });

    return this.get(normalizedCode);
  }

  private normalizeExternalNumber(value: string): number {
    let normalized = String(value || '').trim();
    if (normalized.includes('.') && normalized.includes(',')) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
    } else {
      normalized = normalized.replace(/,/g, '.');
    }
    const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('No se pudo parsear la tasa externa');
    }
    return parsed;
  }

  async fetchExternalRate(code: string): Promise<number> {
    const normalizedCode = this.normalizeCode(code);
    if (normalizedCode !== 'CUP') {
      throw new NotFoundException('Solo CUP se puede obtener de la fuente externa');
    }

    const response = await fetch('https://www.eltoque.com');
    if (!response.ok) {
      throw new BadRequestException('No se pudo obtener datos de la fuente externa');
    }

    const html = await response.text();
    const match = html.match(/<tr[^>]*>\s*<td[^>]*>\s*<span[^>]*>\s*1\s*(?:<!--.*?-->)?\s*USD\s*<\/span>.*?<span[^>]*>\s*([0-9.,]+)\s*(?:<!--.*?-->)?\s*(?:&nbsp;|\s*)CUP\s*<\/span>/is);
    if (!match) {
      throw new BadRequestException('No se encontró la tasa CUP en el contenido externo');
    }

    const numericValue = this.normalizeExternalNumber(match[1]);
    if (!numericValue || numericValue <= 0) {
      throw new BadRequestException('La tasa CUP obtenida no es válida');
    }

    return 1 / numericValue;
  }

  async updateRateFromExternal(code: string) {
    const rate = await this.fetchExternalRate(code);
    return this.updateRate(code, rate);
  }

  async setDefault(code: string) {
    const normalizedCode = this.normalizeCode(code);
    if (normalizedCode === 'EUR') {
      throw new BadRequestException('EUR está deshabilitada temporalmente');
    }

    const list = this.sanitizeList(await this.readFile());
    if (!list.some(c => this.normalizeCode(c.code) === normalizedCode)) throw new NotFoundException('Currency not found');
    const newList = list.map(c => ({ ...c, isDefault: this.normalizeCode(c.code) === normalizedCode }));
    await this.writeFile(newList);
    const updated = newList.find(c => this.normalizeCode(c.code) === normalizedCode)!;
    const latest = await this.get(normalizedCode);
    return { ...updated, rate: latest?.rate ?? updated.rate };
  }

  async createCurrency(input: { code: string; name: string; rate?: number; isDefault?: boolean }) {
    const code = this.normalizeCode(input.code);
    if (!code || !/^[A-Z]{3}$/.test(code)) {
      throw new BadRequestException('Código de moneda inválido');
    }
    if (code === 'EUR') {
      throw new BadRequestException('EUR está deshabilitada temporalmente');
    }

    const name = String(input.name || '').trim();
    if (!name) {
      throw new BadRequestException('Nombre de moneda requerido');
    }

    const list = this.sanitizeList(await this.readFile());
    if (list.some(c => this.normalizeCode(c.code) === code)) {
      throw new BadRequestException('La moneda ya existe');
    }

    const rate = code === 'USD' ? 1 : Number(input.rate || 0);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new BadRequestException('La tasa debe ser mayor que 0');
    }

    const entry: CurrencyEntry = {
      code,
      name,
      rate,
      isDefault: !!input.isDefault,
    };

    const next: CurrencyEntry[] = input.isDefault
      ? [...list.map(c => ({ ...c, isDefault: false })), entry]
      : [...list, entry];

    await this.writeFile(next);

    await this.prisma.currencyRate.create({
      data: {
        code,
        rate: entry.rate,
        effectiveFrom: new Date(),
      },
    });

    return this.get(code);
  }

  async getRateAt(code: string, at: Date): Promise<number> {
    const normalizedCode = this.normalizeCode(code);
    if (normalizedCode === 'USD') return 1;

    const row = await this.prisma.currencyRate.findFirst({
      where: {
        code: normalizedCode,
        effectiveFrom: { lte: at },
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (row) {
      return row.rate instanceof Prisma.Decimal ? row.rate.toNumber() : (row.rate as any);
    }

    const list = await this.readFile();
    const entry = list.find(c => this.normalizeCode(c.code) === normalizedCode);
    if (entry && typeof entry.rate === 'number') return entry.rate;

    return 1;
  }
}
