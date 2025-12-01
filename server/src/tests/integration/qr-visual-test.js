/**
 * QR Visual Integration Test
 * 
 * @description Interactive web server for manual QR code testing with real phones
 * @usage npm run test:visual
 * @category Integration Test
 * @author SGTU Event Team
 * @version 2.0.0
 * 
 * Features:
 * - Express server on http://localhost:3001
 * - Displays real QR codes from production database
 * - Shows 3 students + 2 stalls with full details
 * - Copy token functionality for debugging
 * - Refresh button for cache testing
 * 
 * Use Cases:
 * - Manual phone scanning validation
 * - Visual QR density comparison
 * - Pre-production smoke testing
 * - Token format verification
 */

import QRCodeService from '../../services/qrCode.js';
import { query } from '../../config/db.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

// HTML template for displaying QR codes
const htmlTemplate = (qrCodes) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>QR Code Scanner Test - SGTU Event</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        
        header {
            text-align: center;
            color: white;
            margin-bottom: 40px;
        }
        
        h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .instructions {
            background: white;
            border-radius: 15px;
            padding: 25px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        
        .instructions h2 {
            color: #667eea;
            margin-bottom: 15px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        .instructions ol {
            margin-left: 20px;
            line-height: 1.8;
        }
        
        .instructions li {
            margin-bottom: 10px;
        }
        
        .badge {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 2px 8px;
            border-radius: 5px;
            font-size: 0.8rem;
            font-weight: bold;
        }
        
        .qr-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
            gap: 25px;
            margin-bottom: 30px;
        }
        
        .qr-card {
            background: white;
            border-radius: 15px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            transition: transform 0.3s ease, box-shadow 0.3s ease;
            position: relative;
            overflow: hidden;
        }
        
        .qr-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 40px rgba(0,0,0,0.3);
        }
        
        .qr-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 5px;
            background: linear-gradient(90deg, #667eea, #764ba2);
        }
        
        .qr-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 15px;
        }
        
        .qr-type {
            font-weight: bold;
            color: #667eea;
            font-size: 1.2rem;
        }
        
        .status-badge {
            padding: 5px 12px;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: bold;
            text-transform: uppercase;
        }
        
        .status-badge.student {
            background: #e3f2fd;
            color: #1976d2;
        }
        
        .status-badge.stall {
            background: #f3e5f5;
            color: #7b1fa2;
        }
        
        .qr-info {
            margin-bottom: 20px;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 10px;
        }
        
        .qr-info-item {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 0.9rem;
        }
        
        .qr-info-label {
            font-weight: 600;
            color: #555;
        }
        
        .qr-info-value {
            color: #333;
            font-family: 'Courier New', monospace;
        }
        
        .qr-image-container {
            text-align: center;
            padding: 20px;
            background: white;
            border-radius: 10px;
            border: 3px solid #667eea;
        }
        
        .qr-image {
            max-width: 100%;
            height: auto;
            border-radius: 5px;
        }
        
        .scan-instruction {
            text-align: center;
            margin-top: 15px;
            color: #666;
            font-size: 0.9rem;
            font-style: italic;
        }
        
        .token-box {
            margin-top: 15px;
            padding: 10px;
            background: #f0f0f0;
            border-radius: 5px;
            font-size: 0.75rem;
            word-break: break-all;
            font-family: 'Courier New', monospace;
            color: #555;
            cursor: pointer;
            transition: background 0.3s ease;
        }
        
        .token-box:hover {
            background: #e0e0e0;
        }
        
        .copy-btn {
            display: inline-block;
            margin-top: 10px;
            padding: 8px 16px;
            background: #667eea;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 0.85rem;
            transition: background 0.3s ease;
        }
        
        .copy-btn:hover {
            background: #5568d3;
        }
        
        footer {
            text-align: center;
            color: white;
            margin-top: 40px;
            padding: 20px;
            opacity: 0.9;
        }
        
        .refresh-btn {
            display: block;
            margin: 30px auto;
            padding: 15px 40px;
            background: white;
            color: #667eea;
            border: none;
            border-radius: 50px;
            font-size: 1.1rem;
            font-weight: bold;
            cursor: pointer;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
        }
        
        .refresh-btn:hover {
            transform: scale(1.05);
            box-shadow: 0 8px 20px rgba(0,0,0,0.3);
        }
        
        @media (max-width: 768px) {
            .qr-grid {
                grid-template-columns: 1fr;
            }
            
            h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎫 QR Code Scanner Test</h1>
            <p class="subtitle">Scan these QR codes with your phone to test the system</p>
        </header>
        
        <div class="instructions">
            <h2>📱 How to Test</h2>
            <ol>
                <li>Open your phone's camera or a QR scanner app</li>
                <li>Point the camera at any QR code below</li>
                <li>The QR code contains a JWT token with user/stall information</li>
                <li>You can use this token to verify in your backend API</li>
                <li><span class="badge">TIP</span> Click on any token to copy it for API testing</li>
            </ol>
        </div>
        
        <div class="qr-grid">
            ${qrCodes.map(qr => `
                <div class="qr-card">
                    <div class="qr-header">
                        <span class="qr-type">${qr.type === 'STUDENT' ? '👨‍🎓 Student' : '🏪 Stall'}</span>
                        <span class="status-badge ${qr.type.toLowerCase()}">${qr.type}</span>
                    </div>
                    
                    <div class="qr-info">
                        ${qr.type === 'STUDENT' ? `
                            <div class="qr-info-item">
                                <span class="qr-info-label">Name:</span>
                                <span class="qr-info-value">${qr.data.name}</span>
                            </div>
                            <div class="qr-info-item">
                                <span class="qr-info-label">Email:</span>
                                <span class="qr-info-value">${qr.data.email}</span>
                            </div>
                            <div class="qr-info-item">
                                <span class="qr-info-label">Registration:</span>
                                <span class="qr-info-value">${qr.data.registration_no}</span>
                            </div>
                        ` : `
                            <div class="qr-info-item">
                                <span class="qr-info-label">Stall Number:</span>
                                <span class="qr-info-value">${qr.data.stall_number}</span>
                            </div>
                            <div class="qr-info-item">
                                <span class="qr-info-label">Stall Name:</span>
                                <span class="qr-info-value">${qr.data.stall_name}</span>
                            </div>
                            <div class="qr-info-item">
                                <span class="qr-info-label">School:</span>
                                <span class="qr-info-value">${qr.data.school_name}</span>
                            </div>
                        `}
                    </div>
                    
                    <div class="qr-image-container">
                        <img src="${qr.qr_image}" alt="${qr.type} QR Code" class="qr-image">
                        <p class="scan-instruction">👆 Scan this QR code with your phone</p>
                    </div>
                    
                    <div class="token-box" onclick="copyToken('${qr.token}', this)" title="Click to copy token">
                        <strong>JWT Token:</strong><br>
                        ${qr.token.substring(0, 50)}...
                    </div>
                    <button class="copy-btn" onclick="copyToken('${qr.token}', this)">📋 Copy Full Token</button>
                </div>
            `).join('')}
        </div>
        
        <button class="refresh-btn" onclick="window.location.reload()">🔄 Generate New QR Codes</button>
        
        <footer>
            <p>🎉 SGTU Event Management System</p>
            <p>Production-Ready QR Code System with Redis Caching</p>
        </footer>
    </div>
    
    <script>
        function copyToken(token, element) {
            navigator.clipboard.writeText(token).then(() => {
                const originalText = element.textContent;
                element.textContent = '✅ Copied!';
                element.style.background = '#4caf50';
                element.style.color = 'white';
                
                setTimeout(() => {
                    element.textContent = originalText;
                    element.style.background = '';
                    element.style.color = '';
                }, 2000);
            });
        }
    </script>
</body>
</html>
`;

// Generate sample QR codes
async function generateSampleQRs() {
    console.log('🔍 Fetching sample data from database...\n');
    
    const qrCodes = [];
    
    try {
        // Get 3 real students from database
        const students = await query(`
            SELECT id, full_name, email, registration_no, qr_code_token 
            FROM students 
            LIMIT 3
        `);
        
        console.log(`✅ Found ${students.length} students\n`);
        
        for (const student of students) {
            console.log(`Generating QR for student: ${student.full_name}`);
            let token = student.qr_code_token;
            let qrImage;
            
            if (!token) {
                // Generate if missing
                console.log(`   → Creating new QR token...`);
                token = QRCodeService.generateStudentQRToken(student);
                await query(
                    'UPDATE students SET qr_code_token = $1 WHERE id = $2',
                    [token, student.id]
                );
            }
            
            qrImage = await QRCodeService.generateQRCodeImage(token);
            
            qrCodes.push({
                type: 'STUDENT',
                token,
                qr_image: qrImage,
                data: {
                    name: student.full_name,
                    email: student.email,
                    registration_no: student.registration_no
                }
            });
        }
        
        // Get 2 real stalls from database
        const stalls = await query(`
            SELECT s.id, s.stall_number, s.stall_name, s.school_id, s.qr_code_token, sc.school_name
            FROM stalls s
            JOIN schools sc ON s.school_id = sc.id
            LIMIT 2
        `);
        
        console.log(`✅ Found ${stalls.length} stalls\n`);
        
        for (const stall of stalls) {
            console.log(`Generating QR for stall: ${stall.stall_number} - ${stall.stall_name}`);
            let token = stall.qr_code_token;
            let qrImage;
            
            if (!token) {
                console.log(`   → Creating new QR token...`);
                token = QRCodeService.generateStallQRToken(stall);
                await query(
                    'UPDATE stalls SET qr_code_token = $1 WHERE id = $2',
                    [token, stall.id]
                );
            }
            
            qrImage = await QRCodeService.generateQRCodeImage(token);
            
            qrCodes.push({
                type: 'STALL',
                token,
                qr_image: qrImage,
                data: {
                    stall_number: stall.stall_number,
                    stall_name: stall.stall_name,
                    school_name: stall.school_name
                }
            });
        }
        
        console.log(`\n✅ Generated ${qrCodes.length} QR codes successfully!\n`);
        
    } catch (error) {
        console.error('❌ Error generating QR codes:', error);
        throw error;
    }
    
    return qrCodes;
}

// API endpoint to verify scanned QR
app.get('/api/verify/:token', (req, res) => {
    const { token } = req.params;
    
    // Try to verify as student
    let verification = QRCodeService.verifyStudentQRToken(token);
    if (verification.valid) {
        return res.json({
            success: true,
            type: 'STUDENT',
            data: verification
        });
    }
    
    // Try to verify as stall
    verification = QRCodeService.verifyStallQRToken(token);
    if (verification.valid) {
        return res.json({
            success: true,
            type: 'STALL',
            data: verification
        });
    }
    
    res.status(400).json({
        success: false,
        error: 'Invalid QR token'
    });
});

// Main page
app.get('/', async (req, res) => {
    try {
        const qrCodes = await generateSampleQRs();
        res.send(htmlTemplate(qrCodes));
    } catch (error) {
        res.status(500).send(`
            <h1>Error generating QR codes</h1>
            <p>${error.message}</p>
        `);
    }
});

// Start server
app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║   🎫 QR Code Visual Test Server Started              ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');
    console.log(`📱 Open in browser: http://localhost:${PORT}`);
    console.log(`🔍 Scan QR codes with your phone to test the system`);
    console.log(`\n💡 Press Ctrl+C to stop the server\n`);
});
