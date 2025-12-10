import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate demo student data Excel file for testing bulk upload
 */

// Fetch real school IDs from database
async function fetchSchoolIds() {
  try {
    const schools = await query('SELECT id, school_name FROM schools ORDER BY school_name');
    if (schools.length === 0) {
      console.error('❌ No schools found in database!');
      console.log('Please add schools first or run seeders.');
      process.exit(1);
    }
    console.log(`✅ Found ${schools.length} schools in database`);
    schools.forEach(school => {
      console.log(`   - ${school.school_name} (${school.id})`);
    });
    return schools.map(s => s.id);
  } catch (error) {
    console.error('❌ Error fetching schools:', error.message);
    console.log('Make sure your database is running and configured correctly.');
    process.exit(1);
  }
}

// Sample data generators
const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Rohan', 'Anjali', 'Vikram', 'Pooja', 'Arjun', 'Neha', 'Karan', 'Divya', 'Aditya', 'Riya', 'Sanjay', 'Kavya', 'Manish', 'Shreya', 'Nikhil', 'Isha'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Verma', 'Gupta', 'Reddy', 'Jain', 'Agarwal', 'Rao', 'Desai', 'Mehta', 'Nair', 'Iyer', 'Malhotra', 'Chopra', 'Bhatia', 'Kapoor', 'Pandey', 'Joshi'];
const programs = ['B.Tech Computer Science', 'B.Tech Electronics', 'B.Tech Mechanical', 'B.Tech Civil', 'BBA', 'BCA', 'B.Com', 'BA Economics', 'B.Sc Mathematics', 'B.Sc Physics'];
const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const batches = [2024, 2025, 2026, 2027];

// Generate random data
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
const getRandomPincode = () => Math.floor(100000 + Math.random() * 900000).toString();
const getRandomPhone = () => '9' + Math.floor(100000000 + Math.random() * 900000000).toString();

// Generate demo students
function generateDemoStudents(count, schoolIds) {
  const students = [];
  const currentYear = new Date().getFullYear();
  
  for (let i = 1; i <= count; i++) {
    const firstName = getRandomItem(firstNames);
    const lastName = getRandomItem(lastNames);
    const fullName = `${firstName} ${lastName}`;
    const regNo = `2025${String(i).padStart(4, '0')}`;
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@student.sgtu.ac.in`;
    const city = getRandomItem(cities);
    
    // Generate DOB (18-25 years old)
    const minDate = new Date(currentYear - 25, 0, 1);
    const maxDate = new Date(currentYear - 18, 11, 31);
    const dob = getRandomDate(minDate, maxDate).toISOString().split('T')[0];
    
    students.push({
      registration_no: regNo,
      email: email,
      full_name: fullName,
      school_id: getRandomItem(schoolIds), // Use real school IDs from database
      date_of_birth: dob, // Required for password generation
      pincode: getRandomPincode(), // Required for password generation
      phone: getRandomPhone(),
      address: `${Math.floor(Math.random() * 999) + 1}, Sector ${Math.floor(Math.random() * 50) + 1}, ${city}, India`,
      program_name: getRandomItem(programs),
      batch: getRandomItem(batches),
    });
  }
  
  return students;
}

// Create Excel file
async function createDemoExcel(studentCount = 50) {
  console.log(`🔨 Generating ${studentCount} demo students with real school IDs...\n`);
  
  // Fetch real school IDs from database
  const schoolIds = await fetchSchoolIds();
  console.log('');
  
  const students = generateDemoStudents(studentCount, schoolIds);
  const workbook = new ExcelJS.Workbook();
  
  // Create Instructions sheet
  const instructionsSheet = workbook.addWorksheet('📋 Instructions');
  instructionsSheet.columns = [{ key: 'content', width: 80 }];
  
  instructionsSheet.addRows([
    ['DEMO STUDENT DATA - READY FOR BULK UPLOAD'],
    [''],
    ['✅ This file contains REAL school IDs from your database'],
    ['✅ All data is valid and ready to upload'],
    ['✅ Registration numbers are unique'],
    ['✅ Email addresses are unique'],
    ['✅ DOB and pincode included for password auto-generation'],
    [''],
    ['⚠️ PASSWORD AUTO-GENERATION:'],
    ['Passwords are AUTO-GENERATED from date_of_birth + pincode'],
    ['Example: DOB 2005-05-15 + Pincode 110001 = Password "20050515110001"'],
    ['Students will be required to reset password on first login'],
    [''],
    ['📋 Field Information:'],
    ['* registration_no: Unique student registration number'],
    ['  email: Student email address (optional but unique if provided)'],
    ['* full_name: Student full name'],
    ['* school_id: Valid UUID from your schools table'],
    ['* date_of_birth: Birth date YYYY-MM-DD - REQUIRED for password'],
    ['* pincode: 6-digit postal code - REQUIRED for password'],
    ['  phone: 10-digit phone number (optional)'],
    ['  address: Full address (optional)'],
    ['  program_name: Course/Program name (optional)'],
    ['  batch: Graduation year (optional)'],
    [''],
    ['🚀 How to Upload:'],
    [''],
    ['1. VALIDATE FIRST (Recommended):'],
    ['   POST /api/admin/students/validate-upload'],
    ['   - Upload this file'],
    ['   - Check for any errors'],
    ['   - Fix if needed'],
    [''],
    ['2. BULK UPLOAD:'],
    ['   POST /api/admin/students/bulk-upload'],
    ['   - Upload this file'],
    ['   - Wait for completion (~15-20 seconds for 100 records)'],
    ['   - Check response for success/failure details'],
    [''],
    ['💡 Tips:'],
    ['- You can modify any data before uploading'],
    ['- Keep registration_no and email unique'],
    ['- School IDs are already valid'],
    ['- Test with validate route first to catch errors early'],
    [''],
    ['📊 This file contains ' + studentCount + ' demo student records'],
  ]);
  
  instructionsSheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FF0066CC' } };
  instructionsSheet.getRow(3).font = { bold: true, size: 11, color: { argb: 'FF008000' } };
  instructionsSheet.getRow(9).font = { bold: true, size: 12 };
  instructionsSheet.getRow(23).font = { bold: true, size: 12 };
  instructionsSheet.getRow(37).font = { bold: true, size: 12 };
  
  // Create Students sheet
  const studentsSheet = workbook.addWorksheet('Students');
  studentsSheet.columns = [
    { header: 'registration_no', key: 'registration_no', width: 20 },
    { header: 'email', key: 'email', width: 40 },
    { header: 'full_name', key: 'full_name', width: 25 },
    { header: 'school_id', key: 'school_id', width: 38 },
    { header: 'date_of_birth', key: 'date_of_birth', width: 15 },
    { header: 'pincode', key: 'pincode', width: 10 },
    { header: 'phone', key: 'phone', width: 15 },
    { header: 'address', key: 'address', width: 50 },
    { header: 'program_name', key: 'program_name', width: 25 },
    { header: 'batch', key: 'batch', width: 10 },
  ];
  
  // Style header row
  const headerRow = studentsSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  
  // Add student data
  students.forEach(student => {
    studentsSheet.addRow(student);
  });
  
  // Highlight school_id column with green (valid IDs)
  studentsSheet.getColumn('school_id').eachCell((cell, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD4EDDA' }, // Light green background
      };
      cell.note = '✅ Valid school_id from database';
    }
  });
  
  // Add filters
  studentsSheet.autoFilter = {
    from: 'A1',
    to: 'K1',
  };
  
  // Freeze header row
  studentsSheet.views = [{ state: 'frozen', ySplit: 1 }];
  
  // Save file
  const fileName = `demo_students_${studentCount}_READY_TO_UPLOAD.xlsx`;
  const filePath = path.join(__dirname, fileName);
  
  await workbook.xlsx.writeFile(filePath);
  
  console.log('✅ Demo Excel file created successfully!');
  console.log(`📁 File: ${fileName}`);
  console.log(`📍 Location: ${filePath}`);
  console.log(`📊 Records: ${studentCount} students`);
  console.log(`🏫 Schools: Distributed across ${schoolIds.length} real schools`);
  console.log('');
  console.log('✅ School IDs are VALID - Ready to upload immediately!');
  console.log('');
  console.log('🧪 Next Steps:');
  console.log('1. Open the Excel file to review data');
  console.log('2. Test validate route: POST /api/admin/students/validate-upload');
  console.log('3. Test upload route: POST /api/admin/students/bulk-upload');
  console.log('');
  console.log('🎯 File is production-ready!');
}

// Generate different sizes
const args = process.argv.slice(2);
const count = args[0] ? parseInt(args[0]) : 50;

if (isNaN(count) || count < 1 || count > 50000) {
  console.log('Usage: node create-demo-students.js [count]');
  console.log('Example: node create-demo-students.js 100');
  console.log('Count must be between 1 and 50000');
  console.log('Default: 50 students');
  process.exit(1);
}

createDemoExcel(count).catch(err => {
  console.error('❌ Error creating demo file:', err);
  process.exit(1);
});
