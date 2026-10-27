import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

async function check() {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'business_os',
  });
  await ds.initialize();
  const cols = await ds.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'customers' 
    ORDER BY ordinal_position
  `);
  console.log('Customers columns:', cols.map((c: any) => c.column_name));
  await ds.destroy();
}
check().catch(console.error);
