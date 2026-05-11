// Verified against Airtable Meta API on 2026-05-10.
// Base: appgvZ1dbX9me183j
// All field names are EXACT — they are passed straight to Airtable.

export const TABLES = {
  AFTER_SALES: import.meta.env.VITE_AIRTABLE_TABLE_AFTER_SALES || 'After Sales Form',
  DEMO_BOOKING: import.meta.env.VITE_AIRTABLE_TABLE_DEMO_BOOKING || 'Demo Booking Form',
  DEMO_SCHEDULING: import.meta.env.VITE_AIRTABLE_TABLE_DEMO_SCHEDULING || 'Demo Scheduling',
  DEMO_COMPLETION: import.meta.env.VITE_AIRTABLE_TABLE_DEMO_COMPLETION || 'Demo Completion Form',
  EMPLOYEES: import.meta.env.VITE_AIRTABLE_TABLE_EMPLOYEES || 'Employe',
  OLD_COLLECTION: import.meta.env.VITE_AIRTABLE_TABLE_OLD_COLLECTION || 'Old Collection ',
  TEACHERS: import.meta.env.VITE_AIRTABLE_TABLE_TEACHERS || 'Teachers',
};

export const F_AFTER_SALES = {
  BATCH_ID: 'Batch ID',
  STUDENT_LINK: 'Student ID',
  SALE_NO_DEMO: 'Sale w/o Demo',
  SUBJECT: 'Subject Enrolled for',
  AGENT: 'Your Name',
  TEAM: 'Team Name',
  WHO_BOOKED_DEMO: 'Who booked the trial class ?',
  LEAD_CHANNEL: 'Lead Channel',
  LEAD_SOURCE: 'Lead source',
  ENROLLMENT_DATE: 'Enrollment Date',
  ENROLLMENT_TYPE: 'Type of enrollment',
  CLASSES_INCLUDED: 'No of classes included in payment',
  CLASSES_MONTHLY: 'No of classes sold monthly',
  AMOUNT: "Payment Amount in Customer's Currency",
  CURRENCY: 'Currency',
  MODE_OF_PAYMENT: 'Mode of payment',
  PAYMENT_OPTION: 'Payment Option',
  CREATED: 'Created',
  CREATED_BY: 'Created By',
  COLLECTION_INR: 'Collection in INR',
  INR_CALC: 'INR Calculations',
  COUNTRY: 'Country (from Student ID)',
  GRADE: 'Grade',
  PARENT_NAME: 'Parent Name',
  CONTACT: 'Contact number',
  TIMEZONE_STATE: 'Timezone/State',
  TIMEZONE_CITY: 'Timezone/City',
  COUNTRY_CODE: 'Country Code',
  IS_REFERRAL: 'Is this a referral lead',
  REFERRAL_CHANNEL: 'Referral Channel',
  CPC: 'CPC',
};

export const F_DEMO_BOOKING = {
  STUDENT_ID: 'Student ID',
  DEMO_BOOKING_ID: 'Demo booking ID',
  PRESALES_AGENT: 'Pre sales agent name',
  AGENT_NAME: 'Agent Name',
  SALES_AGENT: 'Sales Agent',
  DSA_NAME: 'DSA Name',
  PS_EMAIL: 'PS Email ID',
  STUDENT_NAME: 'Student Name',
  STUDENT_EMAIL: 'Student Email ID',
  STUDENT_CONTACT: 'Student Contact Number',
  COUNTRY: 'Country',
  COUNTRY_CODE: 'Country Code',
  CITY: 'City',
  STUDENT_TIMEZONE: 'Student Time Zone',
  SUBJECT: 'Demo Session Subject',
  DEMO_DATE_CX: 'Demo Class Date and time (CX TZ)',
  DEMO_DATE_IST: 'Demo class data and time IST',
  FORM_FILLING_TIME: 'Form filling time',
  FORM_FILLING_DATE: 'Form Filling date',
  LEAD_SOURCE: 'Lead source',
  SALE_NO_DEMO: 'Sale w/o Demo',
  DEMO_SCHEDULING_LINK: 'Demo Scheduling',
  AFTER_SALES_LINK: 'After Sales',
  DEMO_COMPLETED_LOOKUP: 'Demo Completed (from Demo Scheduling)',
  DEMO_SCHEDULED_LOOKUP: 'Demo Scheduled (from Demo Scheduling)',
};

export const F_DEMO_SCHEDULING = {
  DEMO_ID: 'Demo ID',
  STUDENT_LINK: 'Student ID',
  DEMO_SCHEDULED: 'Demo Scheduled',
  DEMO_COMPLETED: 'Demo Completed',
  DEMO_SUBJECT: 'Demo Subject',
  FINAL_DEMO_DATE: 'Final Demo date and time',
  TEACHER_LINK: 'Demo Teacher Name',
  MEETING_LINK: 'Meeting link',
  SCHEDULED_BY: 'Demo Scheduled by',
  WA_MAIL_SENT: 'Send WA msg and Mail',
  REASON_NOT_SCHEDULED: 'Reason, if demo not scheduled',
  REASON_NOT_COMPLETED: 'Reason, if demo not completed.',
  CREATED: 'Form filling time',
  DSA_NAME: 'DSA Name',
};

export const F_EMPLOYEE = {
  FULL_NAME: 'Full Name (As per Aadhar Card)',
  ID: 'Id',
  EMAIL: 'Personal Email ID',
  CONTACT: 'Contact Number',
  DEPARTMENT: 'Department',
  DESIGNATION: 'Designation',
  REPORTING_MANAGER: 'Reporting Manager',
  JOINING_DATE: 'Joinning Date',
  GENDER: 'Gender',
};

export const F_OLD_COLLECTION = {
  AFTER_SALES_LINK: 'After Sales Form',
  CLASSES_SOLD: 'No of classes sold in that payment',
  CLASSES_MONTHLY: 'No of classes sold monthly',
  CURRENCY: 'Currency',
  AMOUNT: "Amount in customer's currency",
  RENEWED_BY: 'Renewal done by',
  DEPARTMENT: 'Department',
  PAYMENT_DATE: 'Payment Date',
  MODE_OF_PAYMENT: 'Mode of payment',
};

export const SUBJECT_OPTIONS = [
  'Maths', 'Vedic Maths', 'English', 'Public Speaking', 'Science',
  'Coding', 'Financial Literacy', 'Reasoning', 'NAPLAN', 'History',
  'Geography', 'Other',
];

export const CURRENCY_OPTIONS = [
  { code: 'CAD', label: 'Canadian dollar (CAD)' },
  { code: 'AUD', label: 'Australian dollar (AUD)' },
  { code: 'GBP', label: 'British pound (GBP)' },
  { code: 'INR', label: 'Indian rupee (INR)' },
  { code: 'USD', label: 'United States dollar (USD)' },
  { code: 'EUR', label: 'Euro (EUR)' },
  { code: 'NZD', label: 'New Zealand dollar (NZD)' },
];

export const SALES_AGENTS = [
  'Alam', 'Ashima', 'Ekta', 'Deepika', 'Lavanya', 'Ashfaq', 'Abhilash',
  'Ayushi', 'Harsh', 'Karan', 'Shraddha', 'Anisha', 'Lokeshwari',
  'Nehaal', 'Anshika', 'Elegbede Damilola Janet', 'Rishi',
];

export const ENROLLMENT_TYPES = [
  'New Sale', 'Cross Sale on New enrollment',
  'Cross Sale on existing student', 'Reactivation',
];

export const PAYMENT_MODES = [
  'Bank transfer', 'XPay', 'Pay Pal', 'Dodo Pay', 'Stripe',
  'Western Union', 'UPI', 'Others',
];

export const PAYMENT_OPTIONS = [
  'Subscription (Paid for the current month)',
  'Full Payment (Payment for 2 or more months)',
  'Installments (Partial payment of the course)',
];

export const LEAD_CHANNELS = [
  'Pre sales team', 'DSA', 'Performance marketing', 'Referral', 'Others',
];

export const DEPARTMENTS = [
  'Sales', 'Pre Sales', 'Teacher Operations', 'Student Success',
  'Class Support', 'Curriculum', 'Marketing', 'Finance',
  "Founder's Office", 'Founder', 'Tech', 'AR',
];

// Application-side roles. AR is added because the requirements call for it
// even though it is not yet a Department in Airtable.
export const APP_ROLES = {
  MANAGEMENT: 'management',
  SALES: 'sales',
  PRESALES: 'presales',
  AR: 'ar',
  STAFF: 'staff',
};

export const ROLE_FROM_DEPARTMENT = {
  Sales: APP_ROLES.SALES,
  'Pre Sales': APP_ROLES.PRESALES,
  AR: APP_ROLES.AR,
  Founder: APP_ROLES.MANAGEMENT,
  "Founder's Office": APP_ROLES.MANAGEMENT,
};
