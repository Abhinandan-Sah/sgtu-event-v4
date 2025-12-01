// School Seeder - Seeds initial school data
import { query } from '../config/db.js';

const schools = [
  {
    school_name: 'School of Computing Sciences and Engineering',
    description: 'BTech CSE, BTech IT, BCA, MCA programs. Located in Block A'
  },
  {
    school_name: 'School of Civil Engineering',
    description: 'BTech Civil Engineering, Diploma in Civil Engineering programs. Located in Block B1'
  },
  {
    school_name: 'School of Mechanical Engineering',
    description: 'BTech Mechanical Engineering, Diploma in Mechanical Engineering programs. Located in Block B2'
  },
  {
    school_name: 'School of Electrical Engineering',
    description: 'BTech Electrical Engineering, Diploma in Electrical Engineering programs. Located in Block B3'
  },
  {
    school_name: 'School of Biotechnology',
    description: 'BTech Biotechnology, MSc Biotechnology programs. Located in Block B4'
  },
  {
    school_name: 'School of Management',
    description: 'MBA, BBA, B.Com programs. Located in Block C'
  },
  {
    school_name: 'School of Applied Sciences',
    description: 'BSc Physics, Chemistry, Mathematics, Biotechnology, Agriculture programs. Located in Block D'
  },
  {
    school_name: 'School of Pharmacy',
    description: 'B.Pharm, D.Pharm, M.Pharm programs. Located in Block E'
  },
  {
    school_name: 'School of Fashion Designing',
    description: 'Fashion Design, Textile Design, Fashion Technology programs. Located in Block F'
  },
  {
    school_name: 'School of Physical Education',
    description: 'Bachelor of Physical Education, Sports Management, Sports Science programs. Located in Block G'
  }
];

export async function seedSchools() {
  console.log('📚 Seeding schools...');
  
  const seededSchools = [];
  let created = 0;
  let skipped = 0;

  for (const school of schools) {
    try {
      const insertQuery = `
        INSERT INTO schools (school_name, description)
        VALUES ($1, $2)
        ON CONFLICT (school_name) DO NOTHING
        RETURNING *
      `;
      
      const result = await query(insertQuery, [
        school.school_name,
        school.description
      ]);
      
      if (result.length > 0) {
        seededSchools.push(result[0]);
        console.log(`   ✓ Created: ${school.school_name}`);
        created++;
      } else {
        skipped++;
        console.log(`   ⏭  Skipped: ${school.school_name} (already exists)`);
      }
    } catch (error) {
      console.error(`   ✗ Failed: ${school.school_name} - ${error.message}`);
    }
  }

  console.log(`   ✅ Schools: ${created} created, ${skipped} skipped\n`);
  
  // Return all schools for use by other seeders
  const allSchools = await query('SELECT * FROM schools ORDER BY school_name');
  return allSchools;
}

export default seedSchools;
