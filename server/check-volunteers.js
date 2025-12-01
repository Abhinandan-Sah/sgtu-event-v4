import { query } from './src/config/db.js';

(async () => {
  try {
    const events = await query('SELECT id, event_name, event_code FROM events ORDER BY created_at LIMIT 5');
    console.log('Available Events:');
    events.forEach((e, i) => console.log(`${i+1}. ${e.event_name} (${e.event_code})`));
    console.log(`   ID: ${events[0]?.id}\n`);

    const volunteers = await query('SELECT id, full_name, email, event_id FROM volunteers ORDER BY created_at');
    console.log('Current Volunteers:');
    volunteers.forEach((v, i) => console.log(`${i+1}. ${v.full_name} - Event ID: ${v.event_id || 'NULL'}`));
    
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
