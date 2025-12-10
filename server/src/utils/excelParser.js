import ExcelJS from 'exceljs';

/**
 * Excel Parser Utility for Bulk Student Uploads
 * Handles parsing, validation, and transformation of Excel data
 */

// Expected column headers in Excel file
const REQUIRED_COLUMNS = [
  'registration_no',
  'email',
  'full_name',
  'school_id',
  'date_of_birth',
  'pincode',
];

const OPTIONAL_COLUMNS = [
  'phone',
  'date_of_birth',
  'pincode',
  'address',
  'program_name',
  'batch',
];

const ALL_COLUMNS = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

/**
 * Parse Excel file buffer and extract student data
 * @param {Buffer} fileBuffer - Excel file buffer from multer
 * @returns {Promise<Object>} - Parsed data with students array and metadata
 */
export const parseStudentFile = async (fileBuffer) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    // Get first worksheet (assuming student data is in first sheet)
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw new Error('Excel file is empty or has no worksheets');
    }

    // Extract header row (first row)
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      // Remove asterisks (*) from header names to handle both formats
      const headerValue = cell.value ? cell.value.toString().trim().toLowerCase().replace(/\*/g, '') : '';
      headers[colNumber - 1] = headerValue;
    });

    // Validate that all required columns exist
    const missingColumns = REQUIRED_COLUMNS.filter(
      (col) => !headers.includes(col)
    );

    if (missingColumns.length > 0) {
      throw new Error(
        `Missing required columns: ${missingColumns.join(', ')}. Please ensure your Excel file has these column headers.`
      );
    }

    // Get column indexes for mapping
    const columnIndexMap = {};
    ALL_COLUMNS.forEach((col) => {
      const index = headers.indexOf(col);
      if (index !== -1) {
        columnIndexMap[col] = index;
      }
    });

    // Extract student data from rows (skip header row)
    const students = [];
    const errors = [];

    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      // Skip header row
      if (rowNumber === 1) return;

      try {
        const student = {};

        // Extract data for each column
        ALL_COLUMNS.forEach((col) => {
          const colIndex = columnIndexMap[col];
          if (colIndex !== undefined) {
            const cell = row.getCell(colIndex + 1);
            let value = cell.value;

            // Handle special cell types
            if (value && typeof value === 'object') {
              // Handle dates
              if (value instanceof Date) {
                value = value.toISOString().split('T')[0]; // Format as YYYY-MM-DD
              }
              // Handle rich text
              else if (value.richText) {
                value = value.richText.map((t) => t.text).join('');
              }
              // Handle hyperlinks
              else if (value.text) {
                value = value.text;
              }
            }

            // Convert to string and trim
            student[col] = value ? value.toString().trim() : null;
          }
        });

        // Only add if row has at least registration_no (skip empty rows)
        if (student.registration_no) {
          students.push({
            ...student,
            _rowNumber: rowNumber, // Track original row number for error reporting
          });
        }
      } catch (error) {
        errors.push({
          row: rowNumber,
          error: `Failed to parse row: ${error.message}`,
        });
      }
    });

    return {
      students,
      totalRows: students.length,
      errors,
      headers: Object.keys(columnIndexMap),
    };
  } catch (error) {
    throw new Error(`Excel parsing failed: ${error.message}`);
  }
};

/**
 * Validate student data according to business rules
 * @param {Array} students - Array of student objects
 * @returns {Object} - Validation results with valid/invalid students
 */
export const validateStudents = (students) => {
  const validStudents = [];
  const errors = [];

  // Track duplicates within Excel file
  const seenRegistrationNos = new Set();
  const seenEmails = new Set();

  students.forEach((student) => {
    const rowErrors = [];
    const rowNumber = student._rowNumber;

    // Validate registration_no (required)
    if (!student.registration_no || student.registration_no.trim() === '') {
      rowErrors.push({
        field: 'registration_no',
        error: 'Registration number is required',
      });
    } else {
      // Check for duplicates within file
      if (seenRegistrationNos.has(student.registration_no)) {
        rowErrors.push({
          field: 'registration_no',
          error: 'Duplicate registration number in file',
        });
      }
      seenRegistrationNos.add(student.registration_no);
    }

    // Validate email (optional but must be valid if provided)
    if (student.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(student.email)) {
        rowErrors.push({
          field: 'email',
          error: 'Invalid email format',
        });
      } else {
        // Check for duplicates within file
        if (seenEmails.has(student.email.toLowerCase())) {
          rowErrors.push({
            field: 'email',
            error: 'Duplicate email in file',
          });
        }
        seenEmails.add(student.email.toLowerCase());
      }
    }

    // Password will be auto-generated from date_of_birth + pincode
    // No validation needed here

    // Validate full_name (required)
    if (!student.full_name || student.full_name.trim() === '') {
      rowErrors.push({
        field: 'full_name',
        error: 'Full name is required',
      });
    }

    // Validate school_id (required, must be valid UUID)
    if (!student.school_id || student.school_id.trim() === '') {
      rowErrors.push({
        field: 'school_id',
        error: 'School ID is required',
      });
    } else {
      // Validate UUID format
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(student.school_id)) {
        rowErrors.push({
          field: 'school_id',
          error: 'School ID must be a valid UUID',
        });
      }
    }

    // Validate phone (optional, must be 10 digits if provided)
    if (student.phone) {
      const phoneRegex = /^\d{10}$/;
      if (!phoneRegex.test(student.phone)) {
        rowErrors.push({
          field: 'phone',
          error: 'Phone must be exactly 10 digits',
        });
      }
    }

    // Validate date_of_birth (optional, must be valid date and age >= 15)
    if (student.date_of_birth) {
      const dob = new Date(student.date_of_birth);
      if (isNaN(dob.getTime())) {
        rowErrors.push({
          field: 'date_of_birth',
          error: 'Invalid date format (use YYYY-MM-DD)',
        });
      } else {
        // Check age >= 15
        const today = new Date();
        const age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        const dayDiff = today.getDate() - dob.getDate();

        const actualAge =
          monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

        if (actualAge < 15) {
          rowErrors.push({
            field: 'date_of_birth',
            error: 'Student must be at least 15 years old',
          });
        }
      }
    }

    // Validate pincode (optional, must be exactly 6 digits if provided)
    if (student.pincode) {
      const pincodeRegex = /^[0-9]{6}$/;
      if (!pincodeRegex.test(student.pincode)) {
        rowErrors.push({
          field: 'pincode',
          error: 'Pincode must be exactly 6 digits',
        });
      }
    }

    // Validate batch (optional, must be between 2000-2035 if provided)
    if (student.batch) {
      const batch = parseInt(student.batch, 10);
      if (isNaN(batch) || batch < 2000 || batch > 2035) {
        rowErrors.push({
          field: 'batch',
          error: 'Batch must be a number between 2000 and 2035',
        });
      }
    }

    // If row has errors, add to errors array
    if (rowErrors.length > 0) {
      errors.push({
        row: rowNumber,
        errors: rowErrors,
      });
    } else {
      // Remove _rowNumber before adding to valid students
      const { _rowNumber, ...cleanStudent } = student;
      validStudents.push(cleanStudent);
    }
  });

  return {
    valid: errors.length === 0,
    totalRows: students.length,
    validRows: validStudents.length,
    invalidRows: errors.length,
    validStudents,
    errors,
  };
};

/**
 * Export students data to Excel file
 * @param {Array} students - Array of student objects from database
 * @returns {Promise<Buffer>} - Excel file buffer
 */
export const exportStudentsToExcel = async (students) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Students');

  // Define columns
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 38 },
    { header: 'Registration No', key: 'registration_no', width: 20 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Full Name', key: 'full_name', width: 25 },
    { header: 'School Name', key: 'school_name', width: 30 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Date of Birth', key: 'date_of_birth', width: 15 },
    { header: 'Pincode', key: 'pincode', width: 10 },
    { header: 'Address', key: 'address', width: 40 },
    { header: 'Program Name', key: 'program_name', width: 20 },
    { header: 'Batch', key: 'batch', width: 10 },
    { header: 'Total Scan Count', key: 'total_scan_count', width: 18 },
    { header: 'Feedback Count', key: 'feedback_count', width: 15 },
    { header: 'Is Inside Event', key: 'is_inside_event', width: 15 },
    { header: 'Total Events Registered', key: 'total_events_registered', width: 22 },
    { header: 'Created At', key: 'created_at', width: 20 },
  ];

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

  // Add data rows
  students.forEach((student) => {
    worksheet.addRow({
      id: student.id,
      registration_no: student.registration_no,
      email: student.email || '',
      full_name: student.full_name,
      school_name: student.school_name || '',
      phone: student.phone || '',
      date_of_birth: student.date_of_birth
        ? new Date(student.date_of_birth).toISOString().split('T')[0]
        : '',
      pincode: student.pincode || '',
      address: student.address || '',
      program_name: student.program_name || '',
      batch: student.batch || '',
      total_scan_count: student.total_scan_count || 0,
      feedback_count: student.feedback_count || 0,
      is_inside_event: student.is_inside_event ? 'Yes' : 'No',
      total_events_registered: student.total_events_registered || 0,
      created_at: student.created_at
        ? new Date(student.created_at).toLocaleString('en-IN')
        : '',
    });
  });

  // Add filters to header row
  worksheet.autoFilter = {
    from: 'A1',
    to: 'P1',
  };

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Generate Excel template for student bulk upload
 * @returns {Promise<Buffer>} - Excel file buffer
 */
export const generateStudentTemplate = async () => {
  const workbook = new ExcelJS.Workbook();

  // Create Instructions sheet
  const instructionsSheet = workbook.addWorksheet('Instructions');
  instructionsSheet.columns = [
    { key: 'content', width: 80 },
  ];

  instructionsSheet.addRows([
    ['STUDENT BULK UPLOAD TEMPLATE'],
    [''],
    ['Instructions:'],
    [
      '1. Fill the "Students" sheet with student data',
    ],
    [
      '2. All fields marked with * are REQUIRED',
    ],
    [
      '3. Do NOT modify the column headers',
    ],
    [
      '4. Use the correct school_id from the Schools sheet',
    ],
    ['5. Date format: YYYY-MM-DD (e.g., 2005-05-15)'],
    ['6. Phone: 10 digits only (e.g., 9876543210)'],
    ['7. Pincode: 6 digits only (e.g., 110001)'],
    ['8. Batch: Year between 2000-2035 (e.g., 2025)'],
    [''],
    ['⚠️ IMPORTANT - Password Auto-Generation:'],
    ['Passwords are AUTO-GENERATED from date_of_birth + pincode'],
    ['Example: DOB 2005-05-15 + Pincode 110001 = Password "20050515110001"'],
    ['Students MUST reset password on first login using DOB and pincode'],
    [''],
    ['Field Descriptions:'],
    ['* registration_no: Unique student registration number'],
    ['  email: Student email address (optional)'],
    ['* full_name: Student full name'],
    ['* school_id: UUID of the school (see Schools sheet)'],
    ['* date_of_birth: Birth date YYYY-MM-DD - REQUIRED for password'],
    ['* pincode: 6-digit postal code - REQUIRED for password'],
    ['  phone: 10-digit phone number (optional)'],
    ['  address: Full address (optional)'],
    ['  program_name: Course/Program name (optional)'],
    ['  batch: Graduation year (optional)'],
  ]);

  // Style the instructions
  instructionsSheet.getRow(1).font = { bold: true, size: 14 };
  instructionsSheet.getRow(3).font = { bold: true, size: 12 };
  instructionsSheet.getRow(14).font = { bold: true, size: 12 };

  // Create Students sheet
  const studentsSheet = workbook.addWorksheet('Students');
  studentsSheet.columns = [
    { header: 'registration_no*', key: 'registration_no', width: 20 },
    { header: 'email', key: 'email', width: 30 },
    { header: 'full_name*', key: 'full_name', width: 25 },
    { header: 'school_id*', key: 'school_id', width: 38 },
    { header: 'date_of_birth*', key: 'date_of_birth', width: 15 },
    { header: 'pincode*', key: 'pincode', width: 10 },
    { header: 'phone', key: 'phone', width: 15 },
    { header: 'address', key: 'address', width: 40 },
    { header: 'program_name', key: 'program_name', width: 20 },
    { header: 'batch', key: 'batch', width: 11 },
  ];

  // Add sample data rows
  studentsSheet.addRows([
    {
      registration_no: '2025001',
      email: 'john.doe@example.com',
      full_name: 'John Doe',
      school_id: '123e4567-e89b-12d3-a456-426614174000',
      date_of_birth: '2005-05-15',
      pincode: '110001',
      phone: '9876543210',
      address: 'New Delhi, India',
      program_name: 'B.Tech Computer Science',
      batch: 2025,
    },
    {
      registration_no: '2025002',
      email: 'jane.smith@example.com',
      full_name: 'Jane Smith',
      school_id: '123e4567-e89b-12d3-a456-426614174000',
      date_of_birth: '2006-08-22',
      pincode: '110002',
      phone: '9876543211',
      address: 'Mumbai, India',
      program_name: 'B.Tech Electronics',
      batch: 2026,
    },
    {
      registration_no: '2025003',
      email: 'robert.j@example.com',
      full_name: 'Robert Johnson',
      school_id: '123e4567-e89b-12d3-a456-426614174000',
      date_of_birth: '2004-12-10',
      pincode: '110003',
      phone: '',
      address: '',
      program_name: '',
      batch: '',
    },
  ]);

  // Style the header row
  const headerRow = studentsSheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFD3D3D3' },
  };

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Parse Excel file for event registration (registration_no only)
 * @param {Buffer} fileBuffer - Excel file buffer from multer
 * @returns {Promise<Object>} - Parsed data with registration numbers array
 */
export const parseEventRegistrationFile = async (fileBuffer) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new Error('Excel file is empty or has no worksheets');
    }

    // Extract header row
    const headerRow = worksheet.getRow(1);
    const headers = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const headerValue = cell.value ? cell.value.toString().trim().toLowerCase().replace(/\*/g, '') : '';
      headers[colNumber - 1] = headerValue;
    });

    // Check for required column
    if (!headers.includes('registration_no')) {
      throw new Error('Missing required column: registration_no. Please ensure your Excel file has this column header.');
    }

    const regNoIndex = headers.indexOf('registration_no');
    const registrationNumbers = [];
    const errors = [];

    // Extract registration numbers from rows
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header

      const cell = row.getCell(regNoIndex + 1);
      let regNo = cell.value;

      if (regNo && typeof regNo === 'object') {
        if (regNo.richText) {
          regNo = regNo.richText.map(t => t.text).join('');
        } else if (regNo.text) {
          regNo = regNo.text;
        }
      }

      regNo = regNo ? String(regNo).trim() : null;

      // Skip empty rows silently (for template usage)
      if (regNo && regNo.length > 0) {
        registrationNumbers.push(regNo);
      }
      // Don't add errors for empty rows - they're expected in templates
    });

    // Remove duplicates within the file
    const uniqueRegNos = [...new Set(registrationNumbers)];
    const duplicateCount = registrationNumbers.length - uniqueRegNos.length;

    return {
      registrationNumbers: uniqueRegNos,
      totalRows: registrationNumbers.length,
      uniqueCount: uniqueRegNos.length,
      duplicateCount,
      errors
    };
  } catch (error) {
    throw new Error(`Failed to parse event registration file: ${error.message}`);
  }
};

/**
 * Generate Excel template for event registration
 * @param {Object} eventInfo - { event_name, event_code, capacity, current_registrations, school_name }
 * @param {Object} constraints - { can_upload, rate_limit, upload_limit }
 * @returns {Promise<Buffer>} - Excel file buffer
 */
export const generateEventRegistrationTemplate = async (eventInfo = {}, constraints = {}) => {
  const workbook = new ExcelJS.Workbook();

  // Sheet 1: Instructions and Event Info
  if (eventInfo.event_name) {
    const infoSheet = workbook.addWorksheet('Event Info');
    
    infoSheet.columns = [
      { width: 30 },
      { width: 40 }
    ];

    // Event information
    infoSheet.addRow(['Event Name:', eventInfo.event_name]);
    infoSheet.addRow(['Event Code:', eventInfo.event_code || 'N/A']);
    
    if (eventInfo.school_name) {
      infoSheet.addRow(['Your School:', eventInfo.school_name]);
      infoSheet.addRow(['⚠️ Important:', 'Only students from your school can be registered']);
    }
    
    infoSheet.addRow([]);
    
    // Capacity info
    const available = eventInfo.max_capacity ? 
      (eventInfo.max_capacity - eventInfo.current_registrations) : 'Unlimited';
    infoSheet.addRow(['Capacity:', `${eventInfo.current_registrations || 0}/${eventInfo.max_capacity || 'Unlimited'}`]);
    infoSheet.addRow(['Available Slots:', available]);
    
    infoSheet.addRow([]);
    
    // Upload constraints
    if (constraints.upload_limit) {
      infoSheet.addRow(['Upload Limit:', `${constraints.upload_limit} students (more requires admin approval)`]);
    }
    
    if (constraints.rate_limit) {
      infoSheet.addRow(['Rate Limit Status:', constraints.can_upload ? '✅ Can upload now' : '⏳ Please wait']);
      if (constraints.rate_limit.daily_count) {
        infoSheet.addRow(['Daily Uploads:', `${constraints.rate_limit.daily_count}/20 remaining`]);
      }
    }
    
    infoSheet.addRow([]);
    infoSheet.addRow(['Instructions:', 'Fill registration numbers in the next sheet']);
    
    // Style the info sheet
    infoSheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        if (colNumber === 1) {
          cell.font = { bold: true };
        }
        cell.alignment = { vertical: 'middle' };
      });
    });
  }

  // Sheet 2: Registration Numbers
  const dataSheet = workbook.addWorksheet('Student Registrations');
  
  dataSheet.columns = [
    { header: 'registration_no*', key: 'registration_no', width: 20 }
  ];

  // Add example rows
  dataSheet.addRow({ registration_no: '2024CSE001' });
  dataSheet.addRow({ registration_no: '2024CSE002' });
  dataSheet.addRow({ registration_no: '2024PHM123' });

  // Style header
  const headerRow = dataSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0066CC' }
  };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
  
  // Style example rows (light gray)
  for (let i = 2; i <= 4; i++) {
    const row = dataSheet.getRow(i);
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF0F0F0' }
    };
    row.font = { italic: true, color: { argb: 'FF666666' } };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
};

/**
 * Validate event registration data (registration_no array)
 * @param {Array} registrationNumbers - Array of registration numbers
 * @returns {Object} - Validation result
 */
export const validateEventRegistrationData = (registrationNumbers) => {
  const errors = [];
  const validRegNos = [];

  registrationNumbers.forEach((regNo, index) => {
    const rowNumber = index + 2; // Excel row (accounting for header)

    if (!regNo || typeof regNo !== 'string') {
      errors.push({
        row: rowNumber,
        registration_no: regNo,
        error: 'Invalid registration number format'
      });
      return;
    }

    const trimmed = regNo.trim();
    
    if (trimmed.length === 0) {
      errors.push({
        row: rowNumber,
        registration_no: regNo,
        error: 'Registration number cannot be empty'
      });
      return;
    }

    if (trimmed.length < 5 || trimmed.length > 50) {
      errors.push({
        row: rowNumber,
        registration_no: trimmed,
        error: 'Registration number must be between 5 and 50 characters'
      });
      return;
    }

    validRegNos.push(trimmed);
  });

  return {
    valid: errors.length === 0,
    totalRows: registrationNumbers.length,
    validRows: validRegNos.length,
    invalidRows: errors.length,
    validRegistrationNumbers: validRegNos,
    errors
  };
};

export default {
  parseStudentFile,
  validateStudents,
  generateStudentTemplate,
  exportStudentsToExcel,
  parseEventRegistrationFile,
  generateEventRegistrationTemplate,
  validateEventRegistrationData,
};
