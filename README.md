# Mistral Invoice & Receipt Manager - Installation Guide

A full-stack invoice processing and tracking application powered by **Mistral AI** with automated VAT reliability checking for Czech businesses.

## Features 

- **Mistral AI Integration**: Uses `mistral-small-latest` model via Mistral API
- **Integrated Backend**: Single server combines backend API + Mistral proxy (port 3002)
- **Separate Database**: Uses `mistral_invoices.db` (SQLite database)
- **Extraction of financial data**: Intensively tested System prompt guarantees to get the best from Mistral Small 3.2 
- **ISDOC import**: You can import ISDOC e-invoices
- **VAT payer reliability check**: Direct check with MF database of unreliable VAT payers
- **Financial Analytic**:  Analytics of VAT for VAT return statements on quarterly basis (could be easily modified for monthly period), supplier analysis by date range


### 2. **Packages ** 
- Files: `mistral_server.js`, `mistral_database.js`, `Mistral_Invoice_processor.html`, `package.json`
- Database: `mistral_invoices.db`
- API: Mistral with mistral-small-latest model (the newest version of Mistral Small 3.2 )
- Tabs: Invoice Extractor, Expense Tracker, Suppliers

**Web based application (html file) runs on localhost port 3002**

---

## Prerequisites

Before installation, ensure you have:

- **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
- **Python 3** (version 3.7 or higher) - [Download here](https://www.python.org/downloads/)
- **npm** (comes with Node.js)
- **Mistral API Key** - [Get one here](https://console.mistral.ai/)

### Check if already installed:

```bash
# Check Node.js version
node --version

# Check Python version
python --version
# or
python3 --version

# Check npm version
npm --version
```

---

## Installation Steps for Mistral Version

### 1. Navigate to Project Directory

Copy all necessary files to chosen directory (`mistral_server.js`, `mistral_database.js`, `package.json`, `mistral_invoices.db`, `vat_checker.py` )

### 2. Install Dependencies for Mistral App

```bash
npm install 
```

### 3. Install Python Dependencies

Check if Python requests library is available:

```bash
python3 -c "import requests; print('requests is available')"
```

If you see an error, install it:

```bash
pip3 install requests
```

### 4. Verify File Permissions

```bash
# On Mac/Linux
chmod +x vat_checker.py
```

---

## Configuration

### Mistral API Key Setup

When you first open `Mistral_Invoice_processor.html`:

1. Navigate to the "Invoice Extractor" tab
2. Enter your **Mistral API key** in the API Configuration section
3. Optionally enable password protection for the key
4. Click "Save API Key"

The API key is stored encrypted in your browser's localStorage and is never sent anywhere except to Mistral API via the integrated proxy.

---

## Running the Mistral Application

### Start the Mistral Server

From the project directory:

```bash
npm start
```

You should see output like:

```
🚀 Mistral Invoice Manager Server starting...
Connected to Mistral SQLite database: mistral_invoices.db
Mistral database tables initialized successfully
✅ Mistral Invoice Manager Server running on port 3002
Frontend available at: http://localhost:3002
API available at: http://localhost:3002/api
Mistral Proxy available at: http://localhost:3002/api/mistral/chat
📝 Model: mistral-small-latest with T=0.1, top_p=0.95
💾 Database: mistral_invoices.db
```

### Access the Application

Open `Mistral_Invoice_processor.html` directly in your browser:


---

## Using the Mistral Application

### Tab 1: Invoice Extractor

1. **Upload an invoice** (PDF, PNG, JPG, JPEG, GIF, WEBP)
2. **Upload an ISDOC file** (ISDOC XML format)
3. **Review extracted data** - Mistral AI automatically extracts invoice fields
4. **VAT reliability check** - System automatically checks VAT status
5. **Edit as needed** - All fields are editable
6. **Download JSON** or **Add to Tracker**

### Tab 2: Expense Tracker

1. **View statistics** by quarter and year
2. **Upload existing JSON files** for bulk import
3. **Filter by quarter** to see period-specific data
4. **Export data** as CSV for reporting
5. **View supplier breakdown** with pie chart and table

### Tab 3: Suppliers 

1. **Select date range** - Choose start and end dates
2. **Click Load Data** - Fetches invoices from database
3. **View statistics**:
   - Total Expenditures (including VAT)
   - Total Suppliers
   - Total Invoices
4. **Analyze suppliers**:
   - Pie chart (suppliers with ≥2% of total)
   - All Suppliers table with share on you wallet (%) and number of invoices 

---

## Database Management

### Mistral Database Location

The SQLite database file is created automatically at same directory.

### Direct Access

You can directly edit the database using:

- **DB Browser for SQLite** - [Download here](https://sqlitebrowser.org/)
- **DBeaver** - [Download here](https://dbeaver.io/)
- Any SQLite client

Simply open the `mistral_invoices.db` file to view and edit records.

### Backup

To backup your data:

```bash
cp mistral_invoices.db mistral_invoices_backup_$(date +%Y%m%d).db
```
or export data directly from database

---

## Troubleshooting

### Server Won't Start

**Issue:** `Port 3002 is already in use`

**Solution:** :
- Change the port in `mistral_server.js`: `const PORT = 3000-5000;`
- And update `Mistral_Invoice_processor.html`: `const API_BASE_URL = 'http://localhost:300x/api';`

### Mistral API Issues

**Issue:** API errors or authentication failures

**Solution:**
- Verify Mistral API key is correct
- Check you have credits in your Mistral account
- Check browser console (F12) for specific error messages
- Ensure the server is running on same port as frontend html application

### VAT Checking Not Working

Could be error in extracted VAT number or API of Financial Directorate is down. You can set up this value manually.

---

## API Endpoints

The Mistral backend provides these REST API endpoints:

### Mistral Proxy
- `POST /api/mistral/chat` - Process invoice extraction with Mistral AI

### Database Operations
- `GET /api/health` - Server health check
- `GET /api/invoices` - Get all invoices
- `POST /api/invoices` - Add new invoice
- `GET /api/invoices/quarter/:quarter/year/:year` - Get invoices by quarter
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete invoice
- `DELETE /api/invoices` - Clear all invoices
- `GET /api/stats?quarter=X&year=Y` - Get statistics
- `GET /api/suppliers?quarter=X&year=Y` - Get supplier stats
- `GET /api/suppliers/daterange?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` - Get suppliers by date range
- `POST /api/check-vat` - Check VAT reliability

---

## File Structure

```
Mistral_Faktury/
│   ├── package.json                    # Mistral app dependencies
│   ├── mistral_server.js               # Mistral backend + proxy (port 3002)
│   ├── mistral_database.js             # Mistral database operations
│   ├── Mistral_Invoice_processor.html  # Mistral frontend 
│   └── mistral_invoices.db             # Mistral database (auto-created)
│
├── SHARED FILES:
│   ├── vat_checker.py                  # VAT reliability checker (Python)
│   └── README.md          

```

---

## Security Notes

1. **API Keys**: Mistral API keys are stored encrypted in browser localStorage
2. **Database**: SQLite database has no authentication - suitable for single-user or trusted network use
3. **VAT Service**: Connects to official Czech tax authority API (MFCR)
4. **Local Storage**: Invoice data persists in database, not browser storage
5. **Proxy**: Integrated proxy prevents CORS issues when calling Mistral API

---

## System Requirements

- **RAM**: Minimum 2GB
- **Disk Space**: 100MB + space for database
- **Network**: Required for AI extraction and VAT checking
- **Browser**: Modern browser (Chrome, Firefox, Safari, Edge)

---

## Support and Resources

- **Node.js Documentation**: https://nodejs.org/docs/
- **SQLite Documentation**: https://www.sqlite.org/docs.html
- **Express Documentation**: https://expressjs.com/
- **Mistral AI Documentation**: https://docs.mistral.ai/
- **Mistral API Console**: https://console.mistral.ai/

---

## License

This application is provided as-is for personal and commercial use.

---

**Last Updated:** October 2024
**Version:**  1.0.0
