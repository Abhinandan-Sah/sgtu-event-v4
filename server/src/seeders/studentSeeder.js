/**
 * Student Seeder - Production-Ready with Fixed School Assignment
 * 
 * @description Seeds students with their specific schools (from Excel data)
 * @usage npm run seed
 * @category Seeder
 * @author SGTU Event Team
 * @version 3.0.0 (Excel Import Ready)
 * 
 * Features:
 * - Fixed school assignment (matches Excel data)
 * - Auto-generates JWT QR tokens during insert
 * - Production-ready token format (157 chars)
 * - Ready for Excel import pattern
 */

import { query } from '../config/db.js';
import bcrypt from 'bcryptjs';
import QRCodeService from '../services/qrCode.js';

/**
 * Maps program name to correct school name
 * @param {string} programName - The program name (e.g., "BTech CSE")
 * @returns {string} - School name for the program
 */
function getSchoolNameForProgram(programName) {
  // Define program to school mapping
  const programSchoolMap = {
    // Computing Sciences
    'BTech CSE': 'School of Computing Sciences and Engineering',
    'BTech IT': 'School of Computing Sciences and Engineering',
    'BCA': 'School of Computing Sciences and Engineering',
    'MCA': 'School of Computing Sciences and Engineering',
    
    // Engineering Schools (Separate)
    'BTech Civil Engineering': 'School of Civil Engineering',
    'BTech Mechanical Engineering': 'School of Mechanical Engineering',
    'BTech Electrical Engineering': 'School of Electrical Engineering',
    'BTech Biotechnology': 'School of Biotechnology',
    
    // Management
    'MBA': 'School of Management',
    'BBA': 'School of Management',
    'B.Com': 'School of Management',
    
    // Applied Sciences
    'BSc Physics': 'School of Applied Sciences',
    'BSc Chemistry': 'School of Applied Sciences',
    'BSc Mathematics': 'School of Applied Sciences',
    'BSc Biotechnology': 'School of Applied Sciences',
    'BSc Agriculture': 'School of Applied Sciences',
    
    // Pharmacy
    'B.Pharm': 'School of Pharmacy',
    'D.Pharm': 'School of Pharmacy',
    
    // Others
    'Fashion Design': 'School of Fashion Designing',
    'Bachelor of Physical Education': 'School of Physical Education'
  };
  
  return programSchoolMap[programName] || null;
}

const students = [
  // School of Computing Sciences and Engineering (10 students)
  {
    full_name: 'Rahul Sharma',
    email: 'rahul.sharma@sgtu.ac.in',
    registration_no: '2024SGTU10001',
    phone: '9876543210',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-03-15',
    pincode: '110001',
    address: 'A-123, Sector 15, Rohini, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },
  {
    full_name: 'Priya Patel',
    email: 'priya.patel@sgtu.ac.in',
    registration_no: '2024SGTU10002',
    phone: '9876543211',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-07-22',
    pincode: '110002',
    address: 'B-456, Pitampura, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },
  {
    full_name: 'Arjun Desai',
    email: 'arjun.desai@sgtu.ac.in',
    registration_no: '2024SGTU10003',
    phone: '9876543218',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-11-08',
    pincode: '110003',
    address: 'C-789, Model Town, New Delhi',
    program_name: 'BTech IT',
    batch: 2024
  },
  {
    full_name: 'Neha Agarwal',
    email: 'neha.agarwal@sgtu.ac.in',
    registration_no: '2024SGTU10004',
    phone: '9876543219',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2006-01-30',
    pincode: '110004',
    address: 'D-321, Shalimar Bagh, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },
  {
    full_name: 'Karan Malhotra',
    email: 'karan.malhotra@sgtu.ac.in',
    registration_no: '2024SGTU10005',
    phone: '9876543220',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-09-12',
    pincode: '110005',
    address: 'E-654, Ashok Vihar, New Delhi',
    program_name: 'BCA',
    batch: 2024
  },
  {
    full_name: 'Divya Nair',
    email: 'divya.nair@sgtu.ac.in',
    registration_no: '2024SGTU10006',
    phone: '9876543221',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-05-18',
    pincode: '110006',
    address: 'F-987, Narela, New Delhi',
    program_name: 'BTech IT',
    batch: 2024
  },
  {
    full_name: 'Siddharth Joshi',
    email: 'siddharth.joshi@sgtu.ac.in',
    registration_no: '2024SGTU10007',
    phone: '9876543222',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-12-25',
    pincode: '110007',
    address: 'G-234, Tri Nagar, New Delhi',
    program_name: 'MCA',
    batch: 2024
  },
  {
    full_name: 'Riya Shah',
    email: 'riya.shah@sgtu.ac.in',
    registration_no: '2024SGTU10008',
    phone: '9876543223',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2006-04-10',
    pincode: '110008',
    address: 'H-567, Wazirpur, New Delhi',
    program_name: 'BCA',
    batch: 2024
  },
  {
    full_name: 'Aditya Chopra',
    email: 'aditya.chopra@sgtu.ac.in',
    registration_no: '2024SGTU10009',
    phone: '9876543224',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-08-03',
    pincode: '110009',
    address: 'I-890, Saraswati Vihar, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },
  {
    full_name: 'Pooja Rao',
    email: 'pooja.rao@sgtu.ac.in',
    registration_no: '2024SGTU10010',
    phone: '9876543225',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2005-10-20',
    pincode: '110010',
    address: 'J-123, Jahangirpuri, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },

  // Engineering Students (10 students - auto-mapped to specific schools)
  // Civil Engineering → School of Civil Engineering
  // Mechanical Engineering → School of Mechanical Engineering  
  // Electrical Engineering → School of Electrical Engineering
  {
    full_name: 'Amit Kumar',
    email: 'amit.kumar@sgtu.ac.in',
    registration_no: '2024SGTU20001',
    phone: '9876543212',
    school_name: 'School of Civil Engineering',  // Auto-corrected by program_name mapping
    date_of_birth: '2005-02-14',
    pincode: '110011',
    address: 'K-456, Dwarka, New Delhi',
    program_name: 'BTech Civil Engineering',
    batch: 2024
  },
  {
    full_name: 'Sneha Gupta',
    email: 'sneha.gupta@sgtu.ac.in',
    registration_no: '2024SGTU20002',
    phone: '9876543213',
    school_name: 'School of Mechanical Engineering',  // Auto-corrected by program_name mapping
    date_of_birth: '2006-06-28',
    pincode: '110012',
    address: 'L-789, Janakpuri, New Delhi',
    program_name: 'BTech Mechanical Engineering',
    batch: 2024
  },
  {
    full_name: 'Rajesh Yadav',
    email: 'rajesh.yadav@sgtu.ac.in',
    registration_no: '2024SGTU20003',
    phone: '9876543226',
    school_name: 'School of Electrical Engineering',
    date_of_birth: '2005-09-05',
    pincode: '110013',
    address: 'M-321, Uttam Nagar, New Delhi',
    program_name: 'BTech Electrical Engineering',
    batch: 2024
  },
  {
    full_name: 'Ananya Pillai',
    email: 'ananya.pillai@sgtu.ac.in',
    registration_no: '2024SGTU20004',
    phone: '9876543227',
    school_name: 'School of Civil Engineering',
    date_of_birth: '2006-03-17',
    pincode: '110014',
    address: 'N-654, Rajouri Garden, New Delhi',
    program_name: 'BTech Civil Engineering',
    batch: 2024
  },
  {
    full_name: 'Varun Kapoor',
    email: 'varun.kapoor@sgtu.ac.in',
    registration_no: '2024SGTU20005',
    phone: '9876543228',
    school_name: 'School of Mechanical Engineering',
    date_of_birth: '2005-11-29',
    pincode: '110015',
    address: 'O-987, Tilak Nagar, New Delhi',
    program_name: 'BTech Mechanical Engineering',
    batch: 2024
  },
  {
    full_name: 'Sakshi Reddy',
    email: 'sakshi.reddy@sgtu.ac.in',
    registration_no: '2024SGTU20006',
    phone: '9876543229',
    school_name: 'School of Electrical Engineering',
    date_of_birth: '2005-07-14',
    pincode: '110016',
    address: 'P-234, Punjabi Bagh, New Delhi',
    program_name: 'BTech Electrical Engineering',
    batch: 2024
  },
  {
    full_name: 'Harsh Tiwari',
    email: 'harsh.tiwari@sgtu.ac.in',
    registration_no: '2024SGTU20007',
    phone: '9876543230',
    school_name: 'School of Civil Engineering',
    date_of_birth: '2005-12-01',
    pincode: '110017',
    address: 'Q-567, Paschim Vihar, New Delhi',
    program_name: 'BTech Civil Engineering',
    batch: 2024
  },
  {
    full_name: 'Ishita Bhatt',
    email: 'ishita.bhatt@sgtu.ac.in',
    registration_no: '2024SGTU20008',
    phone: '9876543231',
    school_name: 'School of Mechanical Engineering',
    date_of_birth: '2006-05-23',
    pincode: '110018',
    address: 'R-890, Mayapuri, New Delhi',
    program_name: 'BTech Mechanical Engineering',
    batch: 2024
  },
  {
    full_name: 'Nikhil Pandey',
    email: 'nikhil.pandey@sgtu.ac.in',
    registration_no: '2024SGTU20009',
    phone: '9876543232',
    school_name: 'School of Electrical Engineering',
    date_of_birth: '2005-08-19',
    pincode: '110019',
    address: 'S-123, Nangloi, New Delhi',
    program_name: 'BTech Electrical Engineering',
    batch: 2024
  },
  {
    full_name: 'Tanvi Mehta',
    email: 'tanvi.mehta@sgtu.ac.in',
    registration_no: '2024SGTU20010',
    phone: '9876543233',
    school_name: 'School of Civil Engineering',
    date_of_birth: '2006-02-08',
    pincode: '110020',
    address: 'T-456, Moti Nagar, New Delhi',
    program_name: 'BTech Civil Engineering',
    batch: 2024
  },

  // School of Management (10 students)
  {
    full_name: 'Vikram Singh',
    email: 'vikram.singh@sgtu.ac.in',
    registration_no: '2024SGTU30001',
    phone: '9876543214',
    school_name: 'School of Management',
    date_of_birth: '2004-04-12',
    pincode: '110021',
    address: 'U-789, Karol Bagh, New Delhi',
    program_name: 'MBA',
    batch: 2024
  },
  {
    full_name: 'Anjali Verma',
    email: 'anjali.verma@sgtu.ac.in',
    registration_no: '2024SGTU30002',
    phone: '9876543215',
    school_name: 'School of Management',
    date_of_birth: '2004-10-27',
    pincode: '110022',
    address: 'V-321, Rajendra Place, New Delhi',
    program_name: 'MBA',
    batch: 2024
  },
  {
    full_name: 'Gaurav Saxena',
    email: 'gaurav.saxena@sgtu.ac.in',
    registration_no: '2024SGTU30003',
    phone: '9876543234',
    school_name: 'School of Management',
    date_of_birth: '2003-12-15',
    pincode: '110023',
    address: 'W-654, Patel Nagar, New Delhi',
    program_name: 'MBA',
    batch: 2023
  },
  {
    full_name: 'Mansi Jain',
    email: 'mansi.jain@sgtu.ac.in',
    registration_no: '2024SGTU30004',
    phone: '9876543235',
    school_name: 'School of Management',
    date_of_birth: '2004-06-09',
    pincode: '110024',
    address: 'X-987, Jhandewalan, New Delhi',
    program_name: 'BBA',
    batch: 2024
  },
  {
    full_name: 'Abhishek Dubey',
    email: 'abhishek.dubey@sgtu.ac.in',
    registration_no: '2024SGTU30005',
    phone: '9876543236',
    school_name: 'School of Management',
    date_of_birth: '2004-09-21',
    pincode: '110025',
    address: 'Y-234, Dhaula Kuan, New Delhi',
    program_name: 'MBA',
    batch: 2024
  },
  {
    full_name: 'Shreya Iyer',
    email: 'shreya.iyer@sgtu.ac.in',
    registration_no: '2024SGTU30006',
    phone: '9876543237',
    school_name: 'School of Management',
    date_of_birth: '2005-01-05',
    pincode: '110026',
    address: 'Z-567, Saket, New Delhi',
    program_name: 'BBA',
    batch: 2024
  },
  {
    full_name: 'Rohit Mishra',
    email: 'rohit.mishra@sgtu.ac.in',
    registration_no: '2024SGTU30007',
    phone: '9876543238',
    school_name: 'School of Management',
    date_of_birth: '2003-11-18',
    pincode: '110027',
    address: 'AA-890, Hauz Khas, New Delhi',
    program_name: 'MBA',
    batch: 2023
  },
  {
    full_name: 'Kriti Sharma',
    email: 'kriti.sharma@sgtu.ac.in',
    registration_no: '2024SGTU30008',
    phone: '9876543239',
    school_name: 'School of Management',
    date_of_birth: '2004-07-24',
    pincode: '110028',
    address: 'BB-123, Green Park, New Delhi',
    program_name: 'BBA',
    batch: 2024
  },
  {
    full_name: 'Yash Bansal',
    email: 'yash.bansal@sgtu.ac.in',
    registration_no: '2024SGTU30009',
    phone: '9876543240',
    school_name: 'School of Management',
    date_of_birth: '2003-10-11',
    pincode: '110029',
    address: 'CC-456, Malviya Nagar, New Delhi',
    program_name: 'MBA',
    batch: 2023
  },
  {
    full_name: 'Simran Kaur',
    email: 'simran.kaur@sgtu.ac.in',
    registration_no: '2024SGTU30010',
    phone: '9876543241',
    school_name: 'School of Management',
    date_of_birth: '2005-02-19',
    pincode: '110030',
    address: 'DD-789, Lajpat Nagar, New Delhi',
    program_name: 'BBA',
    batch: 2024
  },

  // School of Applied Sciences (10 students)
  {
    full_name: 'Rohan Mehta',
    email: 'rohan.mehta@sgtu.ac.in',
    registration_no: '2024SGTU40001',
    phone: '9876543216',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-05-07',
    pincode: '110031',
    address: 'EE-321, Kalkaji, New Delhi',
    program_name: 'BSc Physics',
    batch: 2024
  },
  {
    full_name: 'Kavya Reddy',
    email: 'kavya.reddy@sgtu.ac.in',
    registration_no: '2024SGTU40002',
    phone: '9876543217',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-09-16',
    pincode: '110032',
    address: 'FF-654, Govindpuri, New Delhi',
    program_name: 'BSc Chemistry',
    batch: 2024
  },
  {
    full_name: 'Akash Tripathi',
    email: 'akash.tripathi@sgtu.ac.in',
    registration_no: '2024SGTU40003',
    phone: '9876543242',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-12-28',
    pincode: '110033',
    address: 'GG-987, Okhla, New Delhi',
    program_name: 'BSc Mathematics',
    batch: 2024
  },
  {
    full_name: 'Nidhi Srivastava',
    email: 'nidhi.srivastava@sgtu.ac.in',
    registration_no: '2024SGTU40004',
    phone: '9876543243',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2006-04-13',
    pincode: '110034',
    address: 'HH-234, Nehru Place, New Delhi',
    program_name: 'BSc Physics',
    batch: 2024
  },
  {
    full_name: 'Vishal Khanna',
    email: 'vishal.khanna@sgtu.ac.in',
    registration_no: '2024SGTU40005',
    phone: '9876543244',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-08-26',
    pincode: '110035',
    address: 'II-567, Greater Kailash, New Delhi',
    program_name: 'BSc Biotechnology',
    batch: 2024
  },
  {
    full_name: 'Aditi Menon',
    email: 'aditi.menon@sgtu.ac.in',
    registration_no: '2024SGTU40006',
    phone: '9876543245',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-11-05',
    pincode: '110036',
    address: 'JJ-890, Vasant Kunj, New Delhi',
    program_name: 'BSc Chemistry',
    batch: 2024
  },
  {
    full_name: 'Pranav Bose',
    email: 'pranav.bose@sgtu.ac.in',
    registration_no: '2024SGTU40007',
    phone: '9876543246',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-07-31',
    pincode: '110037',
    address: 'KK-123, Vasant Vihar, New Delhi',
    program_name: 'BSc Mathematics',
    batch: 2024
  },
  {
    full_name: 'Megha Chatterjee',
    email: 'megha.chatterjee@sgtu.ac.in',
    registration_no: '2024SGTU40008',
    phone: '9876543247',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2006-03-22',
    pincode: '110038',
    address: 'LL-456, Chanakyapuri, New Delhi',
    program_name: 'BSc Physics',
    batch: 2024
  },
  {
    full_name: 'Kunal Das',
    email: 'kunal.das@sgtu.ac.in',
    registration_no: '2024SGTU40009',
    phone: '9876543248',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-10-14',
    pincode: '110039',
    address: 'MM-789, R.K. Puram, New Delhi',
    program_name: 'BSc Biotechnology',
    batch: 2024
  },
  {
    full_name: 'Swati Ghosh',
    email: 'swati.ghosh@sgtu.ac.in',
    registration_no: '2024SGTU40010',
    phone: '9876543249',
    school_name: 'School of Applied Sciences',
    date_of_birth: '2005-06-08',
    pincode: '110040',
    address: 'NN-321, Defence Colony, New Delhi',
    program_name: 'BSc Chemistry',
    batch: 2024
  },

  // School of Pharmacy (10 students)
  {
    full_name: 'Deepak Chauhan',
    email: 'deepak.chauhan@sgtu.ac.in',
    registration_no: '2024SGTU50001',
    phone: '9876543250',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-01-17',
    pincode: '110041',
    address: 'OO-654, Connaught Place, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },
  {
    full_name: 'Ayesha Khan',
    email: 'ayesha.khan@sgtu.ac.in',
    registration_no: '2024SGTU50002',
    phone: '9876543251',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-08-29',
    pincode: '110042',
    address: 'PP-987, Khan Market, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },
  {
    full_name: 'Rahul Bhardwaj',
    email: 'rahul.bhardwaj@sgtu.ac.in',
    registration_no: '2024SGTU50003',
    phone: '9876543252',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-11-11',
    pincode: '110043',
    address: 'QQ-234, South Extension, New Delhi',
    program_name: 'D.Pharm',
    batch: 2024
  },
  {
    full_name: 'Pallavi Kulkarni',
    email: 'pallavi.kulkarni@sgtu.ac.in',
    registration_no: '2024SGTU50004',
    phone: '9876543253',
    school_name: 'School of Pharmacy',
    date_of_birth: '2005-03-26',
    pincode: '110044',
    address: 'RR-567, Safdarjung, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },
  {
    full_name: 'Sanjay Rathore',
    email: 'sanjay.rathore@sgtu.ac.in',
    registration_no: '2024SGTU50005',
    phone: '9876543254',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-06-19',
    pincode: '110045',
    address: 'SS-890, Lodhi Colony, New Delhi',
    program_name: 'D.Pharm',
    batch: 2024
  },
  {
    full_name: 'Ritika Sinha',
    email: 'ritika.sinha@sgtu.ac.in',
    registration_no: '2024SGTU50006',
    phone: '9876543255',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-12-03',
    pincode: '110046',
    address: 'TT-123, Jor Bagh, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },
  {
    full_name: 'Aryan Patel',
    email: 'aryan.patel@sgtu.ac.in',
    registration_no: '2024SGTU50007',
    phone: '9876543256',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-09-15',
    pincode: '110047',
    address: 'UU-456, Sunder Nagar, New Delhi',
    program_name: 'D.Pharm',
    batch: 2024
  },
  {
    full_name: 'Nikita Rane',
    email: 'nikita.rane@sgtu.ac.in',
    registration_no: '2024SGTU50008',
    phone: '9876543257',
    school_name: 'School of Pharmacy',
    date_of_birth: '2005-05-28',
    pincode: '110048',
    address: 'VV-789, Nizamuddin, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },
  {
    full_name: 'Vivek Jha',
    email: 'vivek.jha@sgtu.ac.in',
    registration_no: '2024SGTU50009',
    phone: '9876543258',
    school_name: 'School of Pharmacy',
    date_of_birth: '2004-10-07',
    pincode: '110049',
    address: 'WW-321, Pragati Maidan, New Delhi',
    program_name: 'D.Pharm',
    batch: 2024
  },
  {
    full_name: 'Sonali Deshmukh',
    email: 'sonali.deshmukh@sgtu.ac.in',
    registration_no: '2024SGTU50010',
    phone: '9876543259',
    school_name: 'School of Pharmacy',
    date_of_birth: '2005-01-20',
    pincode: '110050',
    address: 'XX-654, Mayur Vihar, New Delhi',
    program_name: 'B.Pharm',
    batch: 2024
  },

  // Test accounts
  {
    full_name: 'Test Student',
    email: 'test@sgtu.ac.in',
    registration_no: '2024SGTU99999',
    phone: '9999999999',
    school_name: 'School of Computing Sciences and Engineering',
    date_of_birth: '2000-01-01',
    pincode: '123456',
    address: 'Test Address, New Delhi',
    program_name: 'BTech CSE',
    batch: 2024
  },
  {
    full_name: 'Demo User',
    email: 'demo@sgtu.ac.in',
    registration_no: '2024SGTU00000',
    phone: '0000000000',
    school_name: 'School of Management',
    date_of_birth: '2000-12-31',
    pincode: '000000',
    address: 'Demo Address, New Delhi',
    program_name: 'MBA',
    batch: 2024
  }
];

export async function seedStudents(schools) {
  console.log('👨‍🎓 Seeding students with fixed school assignments...');
  
  if (!schools || schools.length === 0) {
    console.log('   ⏭  Skipped: No schools found\n');
    return;
  }

  // Create a map of school names to IDs for quick lookup
  const schoolMap = {};
  schools.forEach(school => {
    schoolMap[school.school_name] = school.id;
  });

  const password = 'student123';
  const hashedPassword = await bcrypt.hash(password, 12);
  
  let created = 0;
  let skipped = 0;
  let failed = 0;
  let corrected = 0;

  for (const student of students) {
    // First, try to get school from student's school_name (backward compatibility)
    let school_id = schoolMap[student.school_name];
    let assignedSchool = student.school_name;
    
    // If school_name doesn't match or we have program_name, use program-based mapping
    if (student.program_name) {
      const correctSchoolName = getSchoolNameForProgram(student.program_name);
      
      if (correctSchoolName) {
        const correctSchoolId = schoolMap[correctSchoolName];
        
        if (correctSchoolId) {
          // If student has wrong school_name, correct it
          if (student.school_name !== correctSchoolName) {
            console.log(`   🔧 Correcting: ${student.full_name} - ${student.program_name} → ${correctSchoolName}`);
            corrected++;
          }
          school_id = correctSchoolId;
          assignedSchool = correctSchoolName;
        }
      }
    }
    
    if (!school_id) {
      console.error(`   ✗ Failed: ${student.full_name} - No school found for "${student.school_name}" or program "${student.program_name}"`);
      failed++;
      continue;
    }

    try {
      // QR tokens are now generated on-demand (rotating every 30 seconds)
      // No need to generate and store them anymore
      
      const insertQuery = `
        INSERT INTO students (
          registration_no, email, password_hash, full_name, 
          school_id, phone, date_of_birth, pincode, address,
          program_name, batch, password_reset_required
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (registration_no) DO NOTHING
        RETURNING id, email, registration_no
      `;
      
      const result = await query(insertQuery, [
        student.registration_no,
        student.email,
        hashedPassword,
        student.full_name,
        school_id,
        student.phone,
        student.date_of_birth || null,
        student.pincode || null,
        student.address || null,
        student.program_name || null,
        student.batch || null,
        true   // password_reset_required (first-time login)
      ]);
      
      if (result.length > 0) {
        console.log(`   ✓ Created: ${student.full_name} (${student.program_name} → ${assignedSchool})`);
        created++;
      } else {
        skipped++;
        console.log(`   ⏭  Skipped: ${student.registration_no} (already exists)`);
      }
    } catch (error) {
      failed++;
      console.error(`   ✗ Failed: ${student.email} - ${error.message}`);
    }
  }

  console.log(`   ✅ Students: ${created} created, ${skipped} skipped, ${failed} failed, ${corrected} corrected\n`);
  
  if (corrected > 0) {
    console.log(`   ℹ️  ${corrected} students were assigned to correct schools based on their program names\n`);
  }
}

export default seedStudents;
