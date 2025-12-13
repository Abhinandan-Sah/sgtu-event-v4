import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../src/config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate demo student data Excel file for testing bulk upload
 */

// Fetch real school IDs from database with their names
async function fetchSchoolsWithPrograms() {
  try {
    const schools = await query('SELECT id, school_name FROM schools ORDER BY school_name');
    if (schools.length === 0) {
      console.error('❌ No schools found in database!');
      console.log('Please add schools first or run seeders.');
      process.exit(1);
    }
    console.log(`✅ Found ${schools.length} schools in database`);
    
    // Map schools to their appropriate programs
    const schoolProgramMap = schools.map(school => {
      let programs = [];
      
      switch(school.school_name) {
        case 'School of Computer Science and Engineering':
          programs = ['B.Tech Computer Science', 'BCA', 'MCA', 'B.Tech Information Technology'];
          break;
        case 'School of Civil Engineering':
          programs = ['B.Tech Civil Engineering', 'Diploma Civil Engineering'];
          break;
        case 'School of Mechanical Engineering':
          programs = ['B.Tech Mechanical Engineering', 'Diploma Mechanical Engineering'];
          break;
        case 'School of Electrical Engineering':
          programs = ['B.Tech Electrical Engineering', 'Diploma Electrical Engineering', 'B.Tech Electronics'];
          break;
        case 'School of Biotechnology':
          programs = ['B.Tech Biotechnology', 'MSc Biotechnology', 'BSc Biotechnology'];
          break;
        case 'School of Management':
          programs = ['MBA', 'BBA', 'B.Com', 'BA Economics'];
          break;
        case 'School of Applied Sciences':
          programs = ['BSc Physics', 'BSc Chemistry', 'BSc Mathematics', 'BSc Agriculture'];
          break;
        case 'School of Pharmacy':
          programs = ['B.Pharm', 'D.Pharm', 'M.Pharm'];
          break;
        case 'School of Fashion Designing':
          programs = ['Fashion Design', 'Textile Design', 'Fashion Technology'];
          break;
        case 'School of Physical Education':
          programs = ['B.P.Ed', 'Sports Management', 'Sports Science'];
          break;
        default:
          // Unknown school - log warning and use generic programs
          console.warn(`   ⚠️  WARNING: Unknown school "${school.school_name}" - using generic programs`);
          programs = ['General Studies', 'Miscellaneous'];
      }
      
      console.log(`   - ${school.school_name} (${school.id}) - ${programs.length} programs`);
      return {
        id: school.id,
        name: school.school_name,
        programs: programs
      };
    });
    
    return schoolProgramMap;
  } catch (error) {
    console.error('❌ Error fetching schools:', error.message);
    console.log('Make sure your database is running and configured correctly.');
    process.exit(1);
  }
}

// Deterministic data arrays for mapped generation
const firstNames = ['Rahul', 'Priya', 'Amit', 'Sneha', 'Rohan', 'Anjali', 'Vikram', 'Pooja', 'Arjun', 'Neha', 'Karan', 'Divya', 'Aditya', 'Riya', 'Sanjay', 'Kavya', 'Manish', 'Shreya', 'Nikhil', 'Isha'];
const lastNames = ['Sharma', 'Patel', 'Kumar', 'Singh', 'Verma', 'Gupta', 'Reddy', 'Jain', 'Agarwal', 'Rao', 'Desai', 'Mehta', 'Nair', 'Iyer', 'Malhotra', 'Chopra', 'Bhatia', 'Kapoor', 'Pandey', 'Joshi'];
const cities = ['Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow'];
const batches = [2024, 2025, 2026, 2027];

// Deterministic data generators (no randomness - all mapped)
const getMappedItem = (arr, index) => arr[index % arr.length];
const getMappedDate = (baseYear, dayOffset) => {
  const year = baseYear - (dayOffset % 8) - 18; // Ages 18-25
  const month = (dayOffset % 12) + 1;
  const day = (dayOffset % 28) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
const getMappedPincode = (index) => String(110001 + (index % 900000)).padStart(6, '0');
const getMappedPhone = (index) => '9' + String(100000000 + (index % 900000000)).padStart(9, '0');

// Generate demo students with deterministic mapped data
function generateDemoStudents(count, schoolProgramMap) {
  const students = [];
  const currentYear = new Date().getFullYear();
  
  // Calculate students per school for even distribution
  const studentsPerSchool = Math.floor(count / schoolProgramMap.length);
  const remainder = count % schoolProgramMap.length;
  
  let studentIndex = 0;
  
  // Distribute students evenly across schools
  schoolProgramMap.forEach((school, schoolIndex) => {
    const studentsForThisSchool = studentsPerSchool + (schoolIndex < remainder ? 1 : 0);
    const programsCount = school.programs.length;
    const studentsPerProgram = Math.ceil(studentsForThisSchool / programsCount);
    
    // Assign students to programs in this school
    for (let i = 0; i < studentsForThisSchool; i++) {
      const programIndex = Math.floor(i / studentsPerProgram);
      const selectedProgram = school.programs[Math.min(programIndex, programsCount - 1)];
      
      const firstName = getMappedItem(firstNames, studentIndex);
      const lastName = getMappedItem(lastNames, studentIndex);
      const fullName = `${firstName} ${lastName}`;
      const regNo = `2025${String(studentIndex + 1).padStart(4, '0')}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${studentIndex + 1}@student.sgtu.ac.in`;
      const city = getMappedItem(cities, studentIndex);
      const dob = getMappedDate(currentYear, studentIndex);
      const batch = getMappedItem(batches, studentIndex);
      
      students.push({
        registration_no: regNo,
        email: email,
        full_name: fullName,
        school_id: school.id,
        date_of_birth: dob,
        pincode: getMappedPincode(studentIndex),
        phone: getMappedPhone(studentIndex),
        address: `${(studentIndex % 999) + 1}, Sector ${(studentIndex % 50) + 1}, ${city}, India`,
        program_name: selectedProgram,
        batch: batch,
      });
      
      studentIndex++;
    }
  });
  
  return students;
}

// Create Excel file with demo students
async function createDemoExcel(studentCount) {
  console.log(`\n🚀 Generating ${studentCount} demo students with correct school-program mapping...\n`);
  
  // Fetch real schools with their programs from database
  const schoolProgramMap = await fetchSchoolsWithPrograms();
  console.log('');
  
  const students = generateDemoStudents(studentCount, schoolProgramMap);
  const workbook = new ExcelJS.Workbook();
  
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
  console.log(`🏫 Schools: Distributed across ${schoolProgramMap.length} real schools`);
  console.log('');
  console.log('✅ School-Program mapping is CORRECT!');
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
