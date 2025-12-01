/**
 * Stall Seeder - Production-Ready with Fixed School Assignment
 * 
 * @description Seeds stalls with their specific schools and auto-generated QR tokens
 * @usage npm run seed
 * @category Seeder
 * @author SGTU Event Team
 * @version 3.0.0 (Excel Import Ready)
 * 
 * Features:
 * - Fixed school assignment (matches stall categories)
 * - Auto-generates short QR tokens (33 chars)
 * - Format: STALL_{number}_{timestamp}_{random_id}
 * - Production-safe with error handling
 * - No manual regeneration needed
 */

import { query } from '../config/db.js';
import crypto from 'crypto';

const stalls = [
  // School of Computing Sciences and Engineering (Block A)
  {
    stall_number: 'CS-001',
    stall_name: 'AI & Machine Learning Lab',
    description: 'Deep Learning, Neural Networks, Computer Vision, and NLP projects',
    location: 'Ground Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-002',
    stall_name: 'Cybersecurity & Ethical Hacking',
    description: 'Network security, penetration testing, and cyber defense demonstrations',
    location: 'Ground Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-003',
    stall_name: 'Full Stack Web Development',
    description: 'Modern web apps with React, Node.js, and cloud deployment',
    location: 'First Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-004',
    stall_name: 'Mobile App Development',
    description: 'Android and iOS app development with Flutter and React Native',
    location: 'First Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-005',
    stall_name: 'Data Science & Analytics',
    description: 'Big Data analysis, visualization, and predictive modeling',
    location: 'Second Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-006',
    stall_name: 'Cloud Computing & DevOps',
    description: 'AWS, Azure, Docker, Kubernetes, and CI/CD pipelines',
    location: 'Second Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-007',
    stall_name: 'Blockchain & Cryptocurrency',
    description: 'Decentralized applications, smart contracts, and Web3',
    location: 'Third Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },
  {
    stall_number: 'CS-008',
    stall_name: 'IoT & Smart Systems',
    description: 'Internet of Things devices and smart home automation',
    location: 'Third Floor, Block A',
    school_name: 'School of Computing Sciences and Engineering'
  },

  // Engineering Schools (Block B) - Mechanical, Electrical, Civil
  // ME-* → School of Mechanical Engineering
  // EE-* → School of Electrical Engineering
  // CE-* → School of Civil Engineering
  {
    stall_number: 'ME-001',
    stall_name: 'Robotics & Automation',
    description: 'Industrial robots, automated systems, and mechatronics',
    location: 'Ground Floor, Block B',
    school_name: 'School of Mechanical Engineering'
  },
  {
    stall_number: 'ME-002',
    stall_name: '3D Printing & Manufacturing',
    description: 'Additive manufacturing, rapid prototyping, and design',
    location: 'Ground Floor, Block B',
    school_name: 'School of Mechanical Engineering'
  },
  {
    stall_number: 'EE-001',
    stall_name: 'Renewable Energy Systems',
    description: 'Solar panels, wind turbines, and sustainable power solutions',
    location: 'First Floor, Block B',
    school_name: 'School of Electrical Engineering'
  },
  {
    stall_number: 'EE-002',
    stall_name: 'Electronics & Circuit Design',
    description: 'PCB design, embedded systems, and microcontrollers',
    location: 'First Floor, Block B',
    school_name: 'School of Electrical Engineering'
  },
  {
    stall_number: 'CE-001',
    stall_name: 'Smart Infrastructure Models',
    description: 'Sustainable construction, green buildings, and urban planning',
    location: 'Second Floor, Block B',
    school_name: 'School of Civil Engineering'
  },
  {
    stall_number: 'CE-002',
    stall_name: 'Bridge & Structure Design',
    description: 'Structural engineering models and earthquake-resistant designs',
    location: 'Second Floor, Block B',
    school_name: 'School of Civil Engineering'
  },
  {
    stall_number: 'ME-003',
    stall_name: 'Drone Technology',
    description: 'UAV systems, aerial photography, and autonomous flight',
    location: 'Third Floor, Block B',
    school_name: 'School of Mechanical Engineering'
  },
  {
    stall_number: 'EE-003',
    stall_name: 'Electric Vehicles & Batteries',
    description: 'EV technology, battery management, and charging systems',
    location: 'Third Floor, Block B',
    school_name: 'School of Electrical Engineering'
  },

  // School of Management (Block C)
  {
    stall_number: 'BM-001',
    stall_name: 'Startup Incubation Hub',
    description: 'Student startup pitches, business models, and entrepreneurship',
    location: 'Ground Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-002',
    stall_name: 'Digital Marketing & Branding',
    description: 'Social media strategies, SEO, content marketing campaigns',
    location: 'Ground Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-003',
    stall_name: 'Financial Planning & Investment',
    description: 'Stock market analysis, portfolio management, fintech solutions',
    location: 'First Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-004',
    stall_name: 'Human Resource Management',
    description: 'Recruitment strategies, employee engagement, and talent development',
    location: 'First Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-005',
    stall_name: 'E-Commerce & Retail Innovation',
    description: 'Online business models, customer experience, and logistics',
    location: 'Second Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-006',
    stall_name: 'Business Analytics & BI',
    description: 'Data-driven decision making, dashboards, and KPI tracking',
    location: 'Second Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-007',
    stall_name: 'Supply Chain Management',
    description: 'Logistics optimization, inventory systems, and procurement',
    location: 'Third Floor, Block C',
    school_name: 'School of Management'
  },
  {
    stall_number: 'BM-008',
    stall_name: 'International Business',
    description: 'Global trade, export-import strategies, and cross-cultural management',
    location: 'Third Floor, Block C',
    school_name: 'School of Management'
  },

  // School of Applied Sciences (Block D)
  {
    stall_number: 'BT-001',
    stall_name: 'Genetic Engineering Lab',
    description: 'DNA sequencing, CRISPR technology, and gene therapy research',
    location: 'Ground Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'BT-002',
    stall_name: 'Pharmaceutical Research',
    description: 'Drug development, clinical trials, and medicinal chemistry',
    location: 'Ground Floor, Block D',
    school_name: 'School of Pharmacy'
  },
  {
    stall_number: 'PH-001',
    stall_name: 'Quantum Physics Experiments',
    description: 'Particle physics, quantum mechanics demonstrations, and research',
    location: 'First Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'CH-001',
    stall_name: 'Green Chemistry Solutions',
    description: 'Sustainable chemistry, eco-friendly materials, and waste reduction',
    location: 'First Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'MA-001',
    stall_name: 'Mathematical Modeling',
    description: 'Computational mathematics, algorithms, and applied mathematics',
    location: 'Second Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'BT-003',
    stall_name: 'Environmental Biotechnology',
    description: 'Bioremediation, waste treatment, and sustainable biotech',
    location: 'Second Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'PH-002',
    stall_name: 'Nanotechnology Applications',
    description: 'Nanomaterials, nanoelectronics, and nanomedicine',
    location: 'Third Floor, Block D',
    school_name: 'School of Applied Sciences'
  },
  {
    stall_number: 'CH-002',
    stall_name: 'Analytical Chemistry Lab',
    description: 'Spectroscopy, chromatography, and chemical analysis techniques',
    location: 'Third Floor, Block D',
    school_name: 'School of Applied Sciences'
  }
];

export async function seedStalls(schools, eventId = null) {
  console.log('🏪 Seeding stalls with fixed school assignments...');
  
  if (!schools || schools.length === 0) {
    console.log('   ⏭  Skipped: No schools found\n');
    return;
  }

  // Create a map of school names to IDs for quick lookup
  const schoolMap = {};
  schools.forEach(school => {
    schoolMap[school.school_name] = school.id;
  });

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const stall of stalls) {
    // Get the school ID from the school name
    const school_id = schoolMap[stall.school_name];
    
    if (!school_id) {
      console.error(`   ✗ Failed: ${stall.stall_name} - School "${stall.school_name}" not found`);
      failed++;
      continue;
    }

    try {
      // Generate production-ready short QR token (33 chars)
      // Format: STALL_{stall_number}_{timestamp}_{random_id}
      const timestamp = Date.now();
      const randomId = crypto.randomBytes(4).toString('base64').replace(/[^a-z0-9]/gi, '').toLowerCase().substring(0, 6);
      const qrToken = `STALL_${stall.stall_number}_${timestamp}_${randomId}`;
      
      // Validation: Ensure token is not too long
      if (qrToken.length > 50) {
        throw new Error(`Generated token too long: ${qrToken.length} chars`);
      }
      
      // Generate sample Cloudinary URL (optional - can be NULL)
      const imageUrl = `https://res.cloudinary.com/dl4rdt9w0/image/upload/v1732636800/stalls/${stall.stall_number.toLowerCase()}.jpg`;
      
      const insertQuery = `
        INSERT INTO stalls (
          stall_number, stall_name, school_id, description, 
          location, qr_code_token, event_id, image_url
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (stall_number) DO NOTHING
        RETURNING id, stall_number, stall_name
      `;
      
      const result = await query(insertQuery, [
        stall.stall_number,
        stall.stall_name,
        school_id,
        stall.description,
        stall.location,
        qrToken,
        eventId, // NULL for legacy stalls, or specific event_id for event-specific stalls
        imageUrl
      ]);
      
      if (result.length > 0) {
        console.log(`   ✓ Created: ${stall.stall_name} (${stall.school_name})`);
        created++;
      } else {
        skipped++;
        console.log(`   ⏭  Skipped: ${stall.stall_number} (already exists)`);
      }
    } catch (error) {
      failed++;
      console.error(`   ✗ Failed: ${stall.stall_number} - ${error.message}`);
    }
  }

  console.log(`   ✅ Stalls: ${created} created, ${skipped} skipped, ${failed} failed\n`);
}

export default seedStalls;
