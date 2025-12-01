import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';

config();

async function verifyVolunteersTable() {
  const sql = neon(process.env.NEON_DATABASE_URL);
  
  console.log('\n🔍 Verifying VOLUNTEERS table structure...\n');
  
  const columns = await sql`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_name = 'volunteers' 
    ORDER BY ordinal_position
  `;
  
  console.log('📋 VOLUNTEERS TABLE COLUMNS:\n');
  columns.forEach((col, idx) => {
    console.log(`   ${(idx + 1).toString().padStart(2)}. ${col.column_name.padEnd(30)} | ${col.data_type.padEnd(25)} | ${col.is_nullable === 'NO' ? '✅ REQUIRED' : '⚪ OPTIONAL'}`);
  });
  
  console.log(`\n✅ Total columns: ${columns.length}`);
  
  // Check for volunteer_id
  const hasVolunteerId = columns.some(col => col.column_name === 'volunteer_id');
  
  if (hasVolunteerId) {
    console.log('\n❌ ERROR: volunteer_id column still exists!');
  } else {
    console.log('\n✅ SUCCESS: volunteer_id column has been removed!');
  }
  
  // Get indexes
  const indexes = await sql`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'volunteers'
  `;
  
  console.log('\n📊 VOLUNTEERS TABLE INDEXES:\n');
  indexes.forEach((idx, i) => {
    console.log(`   ${i + 1}. ${idx.indexname}`);
  });
  
  console.log('\n🎉 Verification complete!\n');
}

verifyVolunteersTable().catch(console.error);
