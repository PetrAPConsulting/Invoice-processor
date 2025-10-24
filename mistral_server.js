const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bodyParser = require('body-parser');
const path = require('path');
const { spawn } = require('child_process');
const fetch = require('node-fetch');
const db = require('./mistral_database');

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static('public'));

// Initialize database
db.initDatabase();

console.log('🚀 Mistral Invoice Manager Server starting...');

// Helper function to call Python VAT checker
function checkVatReliability(vatNumber) {
    return new Promise((resolve) => {
        const pythonProcess = spawn('python3', [path.join(__dirname, 'vat_checker.py'), vatNumber]);

        let output = '';
        let error = '';

        pythonProcess.stdout.on('data', (data) => {
            output += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            error += data.toString();
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                try {
                    const result = JSON.parse(output.trim());
                    resolve(result);
                } catch (parseError) {
                    resolve({
                        status: 'error',
                        reliable_vat_payer: 'true',
                        message: 'Error parsing VAT check response',
                        auto_checked: false
                    });
                }
            } else {
                resolve({
                    status: 'error',
                    reliable_vat_payer: 'true',
                    message: error || 'Error running VAT check service',
                    auto_checked: false
                });
            }
        });

        setTimeout(() => {
            pythonProcess.kill();
            resolve({
                status: 'timeout',
                reliable_vat_payer: 'true',
                message: 'VAT check service timeout',
                auto_checked: false
            });
        }, 15000);
    });
}

// ============================================
// Mistral API Proxy Endpoints
// ============================================

// Process invoice extraction with Mistral Chat API
app.post('/api/mistral/chat', async (req, res) => {
    try {
        const apiKey = req.headers['x-api-key'];
        const { messages, temperature, top_p, max_tokens } = req.body;

        if (!apiKey) {
            return res.status(400).json({ error: 'Missing API key in headers' });
        }

        if (!messages || !Array.isArray(messages)) {
            return res.status(400).json({ error: 'Messages array is required' });
        }

        console.log('🔍 Processing Mistral chat completion...');
        console.log('📄 Messages count:', messages.length);

        const chatRequest = {
            model: 'mistral-small-latest',
            messages: messages,
            temperature: temperature || 0.1,
            top_p: top_p || 0.95,
            max_tokens: max_tokens || 500,
            response_format: {
                type: 'json_object'
            }
        };

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(chatRequest)
        });

        console.log(`📊 Mistral Response status: ${response.status}`);

        const contentType = response.headers.get('content-type');
        if (contentType && !contentType.includes('application/json')) {
            const textResponse = await response.text();
            console.error('❌ Mistral returned non-JSON response:', textResponse.substring(0, 200));
            return res.status(500).json({
                error: `Mistral API returned non-JSON response. Status: ${response.status}`
            });
        }

        let responseData;
        try {
            responseData = await response.json();
        } catch (parseError) {
            const textResponse = await response.text();
            console.error('❌ Failed to parse Mistral response:', textResponse);
            return res.status(500).json({
                error: `Invalid Mistral response: ${textResponse.substring(0, 200)}`
            });
        }

        if (!response.ok) {
            console.error('❌ Mistral processing failed:', response.status, responseData);
            return res.status(response.status).json(responseData);
        }

        console.log('✅ Mistral processing completed');
        console.log('📊 Response tokens:', responseData.usage?.completion_tokens || 'unknown');
        res.json(responseData);

    } catch (error) {
        console.error('❌ Mistral error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Database API Endpoints
// ============================================

// Check VAT reliability
app.post('/api/check-vat', async (req, res) => {
    try {
        const { vat_number } = req.body;

        if (!vat_number) {
            return res.status(400).json({
                success: false,
                error: 'VAT number is required'
            });
        }

        const result = await checkVatReliability(vat_number);
        res.json({ success: true, data: result });
    } catch (error) {
        console.error('Error checking VAT:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check VAT reliability',
            data: {
                status: 'error',
                reliable_vat_payer: 'true',
                message: 'Service temporarily unavailable',
                auto_checked: false
            }
        });
    }
});

// Get all invoices
app.get('/api/invoices', async (req, res) => {
    try {
        const invoices = await db.getAllInvoices();
        res.json({ success: true, data: invoices });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch invoices' });
    }
});

// Get invoices by quarter/year
app.get('/api/invoices/quarter/:quarter/year/:year', async (req, res) => {
    try {
        const { quarter, year } = req.params;
        const invoices = await db.getInvoicesByQuarter(quarter, year);
        res.json({ success: true, data: invoices });
    } catch (error) {
        console.error('Error fetching quarter invoices:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch quarter invoices' });
    }
});

// Add new invoice
app.post('/api/invoices', async (req, res) => {
    try {
        const invoiceData = req.body;

        const requiredFields = ['supplier_name', 'invoice_number', 'duzp', 'total_amount_with_VAT'];
        for (const field of requiredFields) {
            if (!invoiceData[field]) {
                return res.status(400).json({
                    success: false,
                    error: `Missing required field: ${field}`
                });
            }
        }

        const existingInvoice = await db.findInvoice(invoiceData.invoice_number, invoiceData.vat_number);
        if (existingInvoice) {
            return res.status(409).json({
                success: false,
                error: 'Invoice with this number and VAT already exists'
            });
        }

        const invoiceId = await db.addInvoice(invoiceData);
        res.json({ success: true, data: { id: invoiceId, ...invoiceData } });
    } catch (error) {
        console.error('Error adding invoice:', error);
        res.status(500).json({ success: false, error: 'Failed to add invoice' });
    }
});

// Update invoice
app.put('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const invoiceData = req.body;

        const success = await db.updateInvoice(invoiceId, invoiceData);
        if (success) {
            res.json({ success: true, message: 'Invoice updated successfully' });
        } else {
            res.status(404).json({ success: false, error: 'Invoice not found' });
        }
    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({ success: false, error: 'Failed to update invoice' });
    }
});

// Delete invoice
app.delete('/api/invoices/:id', async (req, res) => {
    try {
        const invoiceId = req.params.id;
        const success = await db.deleteInvoice(invoiceId);

        if (success) {
            res.json({ success: true, message: 'Invoice deleted successfully' });
        } else {
            res.status(404).json({ success: false, error: 'Invoice not found' });
        }
    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({ success: false, error: 'Failed to delete invoice' });
    }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
    try {
        const { quarter, year } = req.query;
        const stats = await db.getStatistics(quarter, year);
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch statistics' });
    }
});

// Get supplier statistics
app.get('/api/suppliers', async (req, res) => {
    try {
        const { quarter, year } = req.query;
        const suppliers = await db.getSupplierStats(quarter, year);
        res.json({ success: true, data: suppliers });
    } catch (error) {
        console.error('Error fetching supplier stats:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch supplier stats' });
    }
});

// Get supplier statistics by date range
app.get('/api/suppliers/daterange', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                error: 'Both startDate and endDate are required'
            });
        }

        const suppliers = await db.getSupplierStatsByDateRange(startDate, endDate);
        res.json({ success: true, data: suppliers });
    } catch (error) {
        console.error('Error fetching supplier stats by date range:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch supplier stats by date range' });
    }
});

// Clear all data
app.delete('/api/invoices', async (req, res) => {
    try {
        await db.clearAllInvoices();
        res.json({ success: true, message: 'All invoices deleted successfully' });
    } catch (error) {
        console.error('Error clearing invoices:', error);
        res.status(500).json({ success: false, error: 'Failed to clear invoices' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Mistral Invoice Manager Server is running',
        timestamp: new Date().toISOString()
    });
});

// Catch all for frontend routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Mistral Invoice Manager Server running on port ${PORT}`);
    console.log(`Frontend available at: http://localhost:${PORT}`);
    console.log(`API available at: http://localhost:${PORT}/api`);
    console.log(`Mistral Proxy available at: http://localhost:${PORT}/api/mistral/chat`);
    console.log('📝 Model: mistral-small-latest with T=0.1, top_p=0.95');
    console.log('💾 Database: mistral_invoices.db');
});
