/**
 * Phase 2 Master Data Seeder
 * Idempotent: only inserts missing default records per tenant.
 */
import { DataSource } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { UnitOfMeasure } from './entities/unit-of-measure.entity';
import { Tax } from './entities/tax.entity';
import { PaymentTerm } from './entities/payment-term.entity';

export async function seedMasterDataDefaults(dataSource: DataSource, tenantId: string) {
  const currencyRepo = dataSource.getRepository(Currency);
  const uomRepo = dataSource.getRepository(UnitOfMeasure);
  const taxRepo = dataSource.getRepository(Tax);
  const termRepo = dataSource.getRepository(PaymentTerm);

  const created = { currencies: 0, uoms: 0, taxes: 0, terms: 0 };

  // Currencies
  const currencyDefs = [
    { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', exchangeRate: 1, isBase: true },
    { code: 'USD', name: 'US Dollar', symbol: '$', exchangeRate: 25000, isBase: false },
  ];
  for (const def of currencyDefs) {
    const exists = await currencyRepo.findOne({ where: { tenantId, code: def.code } });
    if (!exists) {
      await currencyRepo.save(currencyRepo.create({ tenantId, ...def, status: 'active' }));
      created.currencies++;
    }
  }

  // UOMs
  const uomDefs = ['pcs', 'kg', 'm', 'l', 'box', 'carton', 'set'];
  for (const code of uomDefs) {
    const exists = await uomRepo.findOne({ where: { tenantId, code } });
    if (!exists) {
      await uomRepo.save(uomRepo.create({ tenantId, code, name: code.toUpperCase(), type: 'QUANTITY', status: 'active' }));
      created.uoms++;
    }
  }

  // Taxes (Vietnam VAT)
  const taxDefs = [
    { code: 'VAT0', name: 'VAT 0%', rate: 0 },
    { code: 'VAT5', name: 'VAT 5%', rate: 5 },
    { code: 'VAT8', name: 'VAT 8%', rate: 8 },
    { code: 'VAT10', name: 'VAT 10%', rate: 10, isDefault: true },
  ];
  for (const def of taxDefs) {
    const exists = await taxRepo.findOne({ where: { tenantId, code: def.code } });
    if (!exists) {
      await taxRepo.save(taxRepo.create({ tenantId, ...def, type: 'VAT', status: 'active', isDefault: def.isDefault ?? false }));
      created.taxes++;
    }
  }

  // Payment Terms
  const termDefs = [
    { code: 'COD', name: 'Cash on Delivery', days: 0 },
    { code: 'NET7', name: 'Net 7', days: 7 },
    { code: 'NET15', name: 'Net 15', days: 15 },
    { code: 'NET30', name: 'Net 30', days: 30 },
    { code: 'NET60', name: 'Net 60', days: 60 },
  ];
  for (const def of termDefs) {
    const exists = await termRepo.findOne({ where: { tenantId, code: def.code } });
    if (!exists) {
      await termRepo.save(termRepo.create({ tenantId, ...def, status: 'active' }));
      created.terms++;
    }
  }

  return created;
}
