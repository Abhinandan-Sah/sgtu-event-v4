# Bulk Registration API Documentation

## Overview
Complete API documentation for bulk student event registration with test cases for success and failure scenarios.

---

## ADMIN ROUTES

### 1. Validate Bulk Registration (Pre-Upload Check)
**Endpoint:** `POST /api/admin/events/:eventId/bulk-register/validate`  
**Auth:** Required (ADMIN role)  
**Content-Type:** `multipart/form-data`

#### Request
```
Headers:
  Authorization: Bearer <admin_token>
  Content-Type: multipart/form-data

Body:
  file: <Excel file with registration_no column>

URL Parameters:
  eventId: UUID of event
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Validation completed successfully",
  "data": {
    "valid": true,
    "summary": {
      "total_in_file": 20,
      "unique_in_file": 20,
      "duplicates_in_file": 0,
      "valid_students": 20,
      "invalid_students": 0,
      "already_registered": 0,
      "new_registrations": 20
    },
    "capacity": {
      "current": 2,
      "max": 500,
      "after_upload": 22,
      "exceeds_capacity": false,
      "available_slots": 498
    },
    "errors": [],
    "warnings": []
  },
  "timestamp": "2025-12-10T12:04:41.602Z"
}
```

**Note:** Student details (name, email, etc.) are NOT returned in validation response for performance reasons. Only counts and registration numbers of invalid/duplicate students are provided.

#### Fail Case 1: Invalid File Format (400)
```json
{
  "success": false,
  "message": "Invalid file format",
  "error": "File must be Excel (.xlsx or .xls)"
}
```

#### Fail Case 2: Missing registration_no Column (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "error": "Excel file must contain 'registration_no' column"
}
```

---

### 2. Bulk Register Students (Admin - Unrestricted)
**Endpoint:** `POST /api/admin/events/:eventId/bulk-register`  
**Auth:** Required (ADMIN role)  
**Content-Type:** `multipart/form-data`

#### Request
```
Headers:
  Authorization: Bearer <admin_token>
  Content-Type: multipart/form-data

Body:
  file: <Excel file>
  bypass_capacity: true/false (optional, default: false)

URL Parameters:
  eventId: UUID
```

#### Success Response (201)
```json
{
  "success": true,
  "message": "Bulk registration completed successfully",
  "data": {
    "total_processed": 150,
    "successful_registrations": 145,
    "failed_registrations": 5,
    "already_registered": 3,
    "invalid_students": 2,
    "event": {
      "id": "event-uuid",
      "name": "Tech Fest 2025",
      "current_registrations": 195,
      "max_capacity": 500
    },
    "audit_log_id": "log-uuid"
  }
}
```

#### Fail Case 1: Event Not Found (404)
```json
{
  "success": false,
  "message": "Event not found",
  "error": "No event found with ID: invalid-uuid"
}
```

#### Fail Case 2: Capacity Exceeded (400)
```json
{
  "success": false,
  "message": "Registration would exceed event capacity",
  "error": {
    "current_count": 450,
    "max_capacity": 500,
    "attempted_registrations": 100,
    "available_slots": 50
  }
}
```

---

### 3. Download Registration Template
**Endpoint:** `GET /api/admin/events/:eventId/bulk-register/template`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>

URL Parameters:
  eventId: UUID
```

#### Success Response (200)
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="Event_Registration_Template.xlsx"

Binary Excel file with:
- Sheet 1: "Student Registration" (registration_no column + sample data)
- Sheet 2: "Instructions" (usage guide)
```

#### Fail Case 1: Unauthorized (401)
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "No token provided"
}
```

#### Fail Case 2: Invalid Token (403)
```json
{
  "success": false,
  "message": "Access denied",
  "error": "Invalid or expired token"
}
```

---

### 4. Get Bulk Registration Logs
**Endpoint:** `GET /api/admin/events/:eventId/bulk-register/logs`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>

URL Parameters:
  eventId: UUID

Query Parameters:
  page: 1 (optional)
  limit: 20 (optional)
  user_role: ADMIN/EVENT_MANAGER (optional)
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Bulk registration logs retrieved",
  "data": {
    "logs": [
      {
        "id": "log-uuid",
        "event_id": "event-uuid",
        "event_name": "Tech Fest 2025",
        "uploaded_by_user_id": "user-uuid",
        "uploaded_by_role": "ADMIN",
        "total_students": 150,
        "successful": 145,
        "failed": 5,
        "created_at": "2025-12-10T10:30:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 5,
      "total_records": 98,
      "limit": 20
    }
  }
}
```

#### Fail Case 1: Event Not Found (404)
```json
{
  "success": false,
  "message": "Event not found"
}
```

#### Fail Case 2: Insufficient Permissions (403)
```json
{
  "success": false,
  "message": "Access denied",
  "error": "Only ADMIN role can access this resource"
}
```

---

### 5. Export Bulk Registration Logs
**Endpoint:** `GET /api/admin/events/:eventId/bulk-register/logs/export`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>

URL Parameters:
  eventId: UUID
```

#### Success Response (200)
```
Content-Type: text/csv
Content-Disposition: attachment; filename="bulk_registration_logs_event-name.csv"

CSV File with columns:
Log ID, Event Name, Uploaded By, Role, Total Students, Successful, Failed, Timestamp
```

#### Fail Case 1: No Logs Found (404)
```json
{
  "success": false,
  "message": "No bulk registration logs found for this event"
}
```

#### Fail Case 2: Export Failed (500)
```json
{
  "success": false,
  "message": "Failed to export logs",
  "error": "Internal server error during CSV generation"
}
```

---

### 6. Get Pending Bulk Registration Requests
**Endpoint:** `GET /api/admin/bulk-registrations/pending`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>

Query Parameters:
  page: 1 (optional)
  limit: 10 (optional)
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Pending requests retrieved",
  "data": {
    "requests": [
      {
        "id": "request-uuid",
        "event_id": "event-uuid",
        "event_name": "Tech Fest 2025",
        "requested_by_user_id": "manager-uuid",
        "requested_by_name": "John Manager",
        "requested_by_role": "EVENT_MANAGER",
        "total_count": 250,
        "student_data": [...],
        "status": "PENDING",
        "created_at": "2025-12-10T10:00:00Z",
        "expires_at": "2025-12-17T10:00:00Z"
      }
    ],
    "pagination": {
      "current_page": 1,
      "total_pages": 3,
      "total_records": 27
    }
  }
}
```

#### Fail Case 1: No Pending Requests (200 - Empty)
```json
{
  "success": true,
  "message": "No pending requests found",
  "data": {
    "requests": [],
    "pagination": {
      "current_page": 1,
      "total_pages": 0,
      "total_records": 0
    }
  }
}
```

#### Fail Case 2: Database Error (500)
```json
{
  "success": false,
  "message": "Failed to retrieve pending requests",
  "error": "Database connection error"
}
```

---

### 7. Approve Bulk Registration Request
**Endpoint:** `POST /api/admin/bulk-registrations/:requestId/approve`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>
  Content-Type: application/json

URL Parameters:
  requestId: UUID

Body:
{
  "bypass_capacity": false (optional)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Bulk registration request approved and processed",
  "data": {
    "request_id": "request-uuid",
    "event_id": "event-uuid",
    "total_students": 250,
    "successful_registrations": 245,
    "failed_registrations": 5,
    "status": "APPROVED",
    "processed_at": "2025-12-10T11:00:00Z"
  }
}
```

#### Fail Case 1: Request Not Found (404)
```json
{
  "success": false,
  "message": "Bulk registration request not found",
  "error": "No request found with ID: invalid-uuid"
}
```

#### Fail Case 2: Request Already Processed (400)
```json
{
  "success": false,
  "message": "Request already processed",
  "error": "Request status is APPROVED, cannot approve again"
}
```

---

### 8. Reject Bulk Registration Request
**Endpoint:** `POST /api/admin/bulk-registrations/:requestId/reject`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>
  Content-Type: application/json

URL Parameters:
  requestId: UUID

Body:
{
  "reason": "Insufficient capacity" (optional)
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Bulk registration request rejected",
  "data": {
    "request_id": "request-uuid",
    "event_id": "event-uuid",
    "total_students": 250,
    "status": "REJECTED",
    "rejection_reason": "Insufficient capacity",
    "rejected_at": "2025-12-10T11:00:00Z"
  }
}
```

#### Fail Case 1: Request Expired (400)
```json
{
  "success": false,
  "message": "Request has expired",
  "error": "Request expired on 2025-12-09T10:00:00Z"
}
```

#### Fail Case 2: Request Not Pending (400)
```json
{
  "success": false,
  "message": "Can only reject pending requests",
  "error": "Current status: APPROVED"
}
```

---

### 9. Update Event Capacity
**Endpoint:** `PATCH /api/admin/events/:eventId/capacity`  
**Auth:** Required (ADMIN role)

#### Request
```
Headers:
  Authorization: Bearer <admin_token>
  Content-Type: application/json

URL Parameters:
  eventId: UUID

Body:
{
  "max_capacity": 1000
}
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Event capacity updated successfully",
  "data": {
    "event_id": "event-uuid",
    "previous_capacity": 500,
    "new_capacity": 1000,
    "current_registrations": 450,
    "available_slots": 550
  }
}
```

#### Fail Case 1: Invalid Capacity (400)
```json
{
  "success": false,
  "message": "Invalid capacity value",
  "error": "Capacity must be greater than current registrations (450)"
}
```

#### Fail Case 2: Event Not Found (404)
```json
{
  "success": false,
  "message": "Event not found"
}
```

---

## EVENT MANAGER ROUTES

### 10. Check Eligibility for Bulk Upload
**Endpoint:** `GET /api/event-manager/events/:eventId/bulk-register/check-eligibility`  
**Auth:** Required (EVENT_MANAGER role)

#### Request
```
Headers:
  Authorization: Bearer <manager_token>

URL Parameters:
  eventId: UUID
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Eligibility check completed",
  "data": {
    "can_upload": true,
    "event_status": "DRAFT",
    "is_owner": true,
    "rate_limits": {
      "cooldown_remaining": 0,
      "uploads_today": 5,
      "max_uploads_per_day": 20,
      "students_uploaded_today": 1200,
      "max_students_per_day": 5000
    },
    "reasons": []
  }
}
```

#### Fail Case 1: Rate Limited (429)
```json
{
  "success": false,
  "message": "Rate limit exceeded",
  "data": {
    "can_upload": false,
    "rate_limits": {
      "cooldown_remaining": 780,
      "uploads_today": 20,
      "max_uploads_per_day": 20
    },
    "reasons": [
      "Rate limit: 15-minute cooldown active (13 minutes remaining)",
      "Daily upload limit reached (20/20)"
    ]
  }
}
```

#### Fail Case 2: Not Event Owner (403)
```json
{
  "success": false,
  "message": "Access denied",
  "data": {
    "can_upload": false,
    "is_owner": false,
    "reasons": [
      "You are not the owner of this event"
    ]
  }
}
```

---

### 11. Validate Bulk Registration (Event Manager)
**Endpoint:** `POST /api/event-manager/events/:eventId/bulk-register/validate`  
**Auth:** Required (EVENT_MANAGER role)  
**Content-Type:** `multipart/form-data`

#### Request
```
Headers:
  Authorization: Bearer <manager_token>
  Content-Type: multipart/form-data

Body:
  file: <Excel file>

URL Parameters:
  eventId: UUID
```

#### Success Response (200)
```json
{
  "success": true,
  "message": "Validation successful",
  "data": {
    "total_students": 50,
    "valid_students": 48,
    "invalid_registration_numbers": ["99999999"],
    "school_mismatches": ["20250100"],
    "already_registered": [],
    "capacity_check": {
      "current_count": 100,
      "max_capacity": 500,
      "new_registrations": 48,
      "after_registration": 148,
      "within_capacity": true
    },
    "requires_approval": false
  }
}
```

#### Fail Case 1: School Mismatch (400)
```json
{
  "success": false,
  "message": "Validation failed",
  "error": "Some students belong to different schools",
  "details": {
    "school_mismatches": ["20250100", "20250101"],
    "your_school_id": "school-123",
    "message": "Event managers can only register students from their own school"
  }
}
```

#### Fail Case 2: Event Published (400)
```json
{
  "success": false,
  "message": "Bulk registration not allowed",
  "error": "Event status is PUBLISHED. Bulk registration only allowed for DRAFT or REJECTED events"
}
```

---

### 12. Bulk Register Students (Event Manager - Restricted)
**Endpoint:** `POST /api/event-manager/events/:eventId/bulk-register`  
**Auth:** Required (EVENT_MANAGER role)  
**Content-Type:** `multipart/form-data`

#### Request
```
Headers:
  Authorization: Bearer <manager_token>
  Content-Type: multipart/form-data

Body:
  file: <Excel file>

URL Parameters:
  eventId: UUID
```

#### Success Response (201) - Direct Registration (<200 students)
```json
{
  "success": true,
  "message": "Bulk registration completed successfully",
  "data": {
    "total_processed": 150,
    "successful_registrations": 148,
    "failed_registrations": 2,
    "already_registered": 1,
    "invalid_students": 1,
    "requires_approval": false,
    "event": {
      "id": "event-uuid",
      "name": "School Tech Fest",
      "current_registrations": 248
    }
  }
}
```

#### Success Response (202) - Approval Required (>200 students)
```json
{
  "success": true,
  "message": "Bulk registration request created (requires admin approval)",
  "data": {
    "requires_approval": true,
    "total_students": 250,
    "request_id": "request-uuid",
    "status": "PENDING",
    "message": "Your request for 250 students has been submitted for admin approval",
    "expires_at": "2025-12-17T10:00:00Z"
  }
}
```

#### Fail Case 1: Rate Limit - Cooldown Active (429)
```json
{
  "success": false,
  "message": "Rate limit exceeded",
  "error": "Please wait 12 minutes before next upload (15-minute cooldown)",
  "details": {
    "cooldown_remaining_seconds": 720,
    "last_upload": "2025-12-10T10:15:00Z",
    "next_allowed": "2025-12-10T10:30:00Z"
  }
}
```

#### Fail Case 2: Daily Student Limit Exceeded (429)
```json
{
  "success": false,
  "message": "Daily student limit exceeded",
  "error": "You have reached the maximum of 5000 students per day",
  "details": {
    "students_uploaded_today": 4850,
    "attempted_upload": 200,
    "max_students_per_day": 5000,
    "remaining_quota": 150
  }
}
```

---

### 13. Download Registration Template (Event Manager)
**Endpoint:** `GET /api/event-manager/events/:eventId/bulk-register/template`  
**Auth:** Required (EVENT_MANAGER role)

#### Request
```
Headers:
  Authorization: Bearer <manager_token>

URL Parameters:
  eventId: UUID
```

#### Success Response (200)
```
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="School_Tech_Fest_Registration_Template.xlsx"

Binary Excel file with:
- Event name in filename
- Sheet 1: registration_no column + sample data
- Sheet 2: Instructions specific to event managers
```

#### Fail Case 1: Not Event Owner (403)
```json
{
  "success": false,
  "message": "Access denied",
  "error": "You can only download templates for events you own"
}
```

#### Fail Case 2: Event Not Found (404)
```json
{
  "success": false,
  "message": "Event not found"
}
```

---

## Common Error Responses

### Authentication Errors

#### 401 - No Token
```json
{
  "success": false,
  "message": "Authentication required",
  "error": "No token provided"
}
```

#### 401 - Invalid Token
```json
{
  "success": false,
  "message": "Invalid token",
  "error": "Token verification failed"
}
```

#### 403 - Wrong Role
```json
{
  "success": false,
  "message": "Access denied",
  "error": "Insufficient permissions for this resource"
}
```

---

## Rate Limiting

### Event Manager Limits
- **Cooldown:** 15 minutes between uploads
- **Daily Uploads:** Maximum 20 uploads per day
- **Daily Students:** Maximum 5000 students per day
- **Approval Threshold:** >200 students requires admin approval

### Admin Limits
- **No rate limits** on bulk registration
- **Can bypass capacity** with `bypass_capacity: true`
- **Can approve/reject** Event Manager requests

---

## File Format Requirements

### Excel File Structure
```
Column Name: registration_no (case-insensitive)
Data Type: Text/String
Format: Alphanumeric registration numbers
Max Rows: 5000 (for Event Managers), unlimited (for Admins)

Example:
| registration_no |
|-----------------|
| 20250001        |
| 20250002        |
| 20250003        |
```

### Supported File Types
- `.xlsx` (Excel 2007+)
- `.xls` (Excel 97-2003)

---

## Status Codes Summary

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/validation requests |
| 201 | Created | Successful registration completed |
| 202 | Accepted | Request submitted for approval |
| 400 | Bad Request | Validation errors, invalid input |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server-side errors |

---

## Testing Tips

### Using Postman/Thunder Client

1. **Get Token First:**
```bash
POST /api/admin/login
Body: { "username": "admin", "password": "password" }
Save token from response
```

2. **Test File Upload:**
```bash
POST /api/admin/events/{eventId}/bulk-register/validate
Headers: Authorization: Bearer {token}
Body: form-data
  file: [Select Excel file]
```

3. **Test Rate Limits (Event Manager):**
```bash
# Upload 1
POST /api/event-manager/events/{eventId}/bulk-register

# Upload 2 (within 15 min) - should fail with 429
POST /api/event-manager/events/{eventId}/bulk-register
```

---

## Notes

1. **Database Requirement:** All registration numbers MUST exist in `students` table
2. **School Scoping:** Event Managers can only register students from their `school_id`
3. **Audit Logging:** All bulk operations are logged in `bulk_registration_audit_logs` table
4. **Transaction Safety:** Bulk inserts use database transactions (rollback on failure)
5. **Performance:** Uses PostgreSQL UNNEST optimization for bulk inserts
6. **Idempotency:** ON CONFLICT DO NOTHING prevents duplicate registrations

---

**Last Updated:** December 10, 2025  
**API Version:** v4  
**Total Endpoints:** 13 (9 Admin + 4 Event Manager)
