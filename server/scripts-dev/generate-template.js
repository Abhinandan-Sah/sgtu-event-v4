import ExcelJS from 'exceljs';

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  
  // Create main data sheet
  const worksheet = workbook.addWorksheet('Student Registration');
  
  // Set up column
  worksheet.columns = [
    { header: 'registration_no', key: 'registration_no', width: 25 }
  ];
  
  // Style header
  worksheet.getRow(1).font = { 
    bold: true, 
    size: 12, 
    color: { argb: 'FFFFFFFF' } 
  };
  worksheet.getRow(1).fill = { 
    type: 'pattern', 
    pattern: 'solid', 
    fgColor: { argb: 'FF4472C4' } 
  };
  worksheet.getRow(1).height = 25;
  worksheet.getRow(1).alignment = { 
    vertical: 'middle', 
    horizontal: 'center' 
  };
  
  // Add sample data (in gray italic)
  const sampleData = [
    '20250001',
    '20250002', 
    '20250003',
    '20250004',
    '20250005',
    '20250006',
    '20250007',
    '20250008',
    '20250009',
    '20250010',
    '20250011',
    '20250012',
    '20250013',
    '20250014',
    '20250015',
    '20250016',
    '20250017',
    '20250018',
    '20250019',
    '20250020'
  ];
  
  sampleData.forEach(regNo => {
    const row = worksheet.addRow({ registration_no: regNo });
    row.getCell(1).font = { 
      color: { argb: 'FF808080' }, 
      italic: true 
    };
  });
  
  // Add empty rows for user input
  for(let i = 0; i < 50; i++) {
    worksheet.addRow({ registration_no: '' });
  }
  
  // Create instructions sheet
  const instructionSheet = workbook.addWorksheet('Instructions');
  instructionSheet.columns = [{ width: 100 }];
  
  instructionSheet.getCell('A1').value = 'BULK REGISTRATION INSTRUCTIONS';
  instructionSheet.getCell('A1').font = { 
    bold: true, 
    size: 16, 
    color: { argb: 'FF4472C4' } 
  };
  
  instructionSheet.getCell('A3').value = '📋 How to Use This Template:';
  instructionSheet.getCell('A3').font = { bold: true, size: 12 };
  
  const instructions = [
    '1. Go to "Student Registration" sheet',
    '2. Fill in student registration numbers (one per row)',
    '3. Remove the gray sample data before uploading',
    '4. Each registration number MUST exist in the students database',
    '5. Save the file and upload via bulk registration feature',
    '',
    '⚠️ Important Rules:',
    '• Event Managers: Can only register students from their own school',
    '• Admins: Can register students from any school',
    '• Maximum 5000 students per upload (Event Managers)',
    '• Maximum 20 uploads per day (Event Managers)',
    '• 15-minute cooldown between uploads (Event Managers)',
    '',
    '📝 Sample Registration Numbers:',
    '20250001, 20250002, 20250003, etc.',
    '',
    '✅ Valid Upload: All registration numbers exist in database',
    '❌ Invalid: Registration numbers not found in database',
    '❌ Invalid: School mismatch (for Event Managers)'
  ];
  
  let row = 4;
  instructions.forEach(instruction => {
    instructionSheet.getCell(`A${row}`).value = instruction;
    if (instruction.startsWith('•') || instruction.startsWith('✅') || instruction.startsWith('❌')) {
      instructionSheet.getCell(`A${row}`).font = { size: 11 };
    }
    row++;
  });
  
  // Save file
  await workbook.xlsx.writeFile('Bulk_Registration_Template.xlsx');
  console.log('✅ Enhanced template created successfully!');
  console.log('📁 File: Bulk_Registration_Template.xlsx');
  console.log('📊 Includes: Sample data + Instructions sheet');
}

generateTemplate().catch(console.error);
