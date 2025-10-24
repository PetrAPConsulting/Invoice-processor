const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path - separate database for Mistral app
const dbPath = path.join(__dirname, 'mistral_invoices.db');

// Database state tracking
let isDbClosed = false;
let isShuttingDown = false;

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err);
    } else {
        console.log('Connected to Mistral SQLite database: mistral_invoices.db');
    }
});

// Helper function to run async queries
const runAsync = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isDbClosed) {
            reject(new Error('Database connection is closed'));
            return;
        }

        db.run(sql, params, function(err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        });
    });
};

// Helper function to get single row
const getAsync = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isDbClosed) {
            reject(new Error('Database connection is closed'));
            return;
        }

        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
            } else {
                resolve(row);
            }
        });
    });
};

// Helper function to get all rows
const allAsync = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        if (isDbClosed) {
            reject(new Error('Database connection is closed'));
            return;
        }

        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
};

// Initialize database and create tables
const initDatabase = async () => {
    try {
        const createInvoicesTable = `
            CREATE TABLE IF NOT EXISTS invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                supplier_name TEXT NOT NULL,
                vat_number TEXT,
                invoice_number TEXT NOT NULL,
                date_of_sale TEXT,
                due_date TEXT,
                duzp TEXT NOT NULL,
                amount_without_VAT_21 REAL DEFAULT 0,
                VAT_21 REAL DEFAULT 0,
                amount_without_VAT_12 REAL DEFAULT 0,
                VAT_12 REAL DEFAULT 0,
                total_amount_with_VAT REAL NOT NULL,
                reliable_VAT_payer TEXT DEFAULT 'true',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        await runAsync(createInvoicesTable);

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_supplier_name ON invoices(supplier_name)',
            'CREATE INDEX IF NOT EXISTS idx_vat_number ON invoices(vat_number)',
            'CREATE INDEX IF NOT EXISTS idx_invoice_number ON invoices(invoice_number)',
            'CREATE INDEX IF NOT EXISTS idx_duzp ON invoices(duzp)',
            'CREATE INDEX IF NOT EXISTS idx_invoice_vat ON invoices(invoice_number, vat_number)'
        ];

        for (const index of indexes) {
            await runAsync(index);
        }

        console.log('Mistral database tables initialized successfully');
    } catch (error) {
        console.error('Error initializing Mistral database:', error);
        throw error;
    }
};

// Add new invoice
const addInvoice = async (invoiceData) => {
    try {
        const {
            supplier_name,
            vat_number = '',
            invoice_number,
            date_of_sale = '',
            due_date = '',
            duzp,
            amount_without_VAT_21 = 0,
            VAT_21 = 0,
            amount_without_VAT_12 = 0,
            VAT_12 = 0,
            total_amount_with_VAT,
            reliable_VAT_payer = 'true'
        } = invoiceData;

        const sql = `
            INSERT INTO invoices (
                supplier_name, vat_number, invoice_number, date_of_sale,
                due_date, duzp, amount_without_VAT_21, VAT_21,
                amount_without_VAT_12, VAT_12, total_amount_with_VAT, reliable_VAT_payer
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const result = await runAsync(sql, [
            supplier_name, vat_number, invoice_number, date_of_sale,
            due_date, duzp, parseFloat(amount_without_VAT_21) || 0,
            parseFloat(VAT_21) || 0, parseFloat(amount_without_VAT_12) || 0,
            parseFloat(VAT_12) || 0, parseFloat(total_amount_with_VAT),
            reliable_VAT_payer
        ]);

        return result.lastID;
    } catch (error) {
        console.error('Error adding invoice:', error);
        throw error;
    }
};

// Get all invoices
const getAllInvoices = async () => {
    try {
        const sql = 'SELECT * FROM invoices ORDER BY duzp DESC, id DESC';
        return await allAsync(sql);
    } catch (error) {
        console.error('Error getting all invoices:', error);
        throw error;
    }
};

// Find invoice by invoice number and VAT number
const findInvoice = async (invoiceNumber, vatNumber) => {
    try {
        const sql = 'SELECT * FROM invoices WHERE invoice_number = ? AND vat_number = ?';
        return await getAsync(sql, [invoiceNumber, vatNumber || '']);
    } catch (error) {
        console.error('Error finding invoice:', error);
        throw error;
    }
};

// Get invoices by quarter and year
const getInvoicesByQuarter = async (quarter, year) => {
    try {
        const sql = `
            SELECT * FROM invoices
            WHERE CAST(substr(duzp, 7, 4) AS INTEGER) = ?
            AND CAST((CAST(substr(duzp, 4, 2) AS INTEGER) - 1) / 3 AS INTEGER) + 1 = ?
            ORDER BY duzp DESC, id DESC
        `;

        return await allAsync(sql, [parseInt(year), parseInt(quarter)]);
    } catch (error) {
        console.error('Error getting invoices by quarter:', error);
        throw error;
    }
};

// Update invoice
const updateInvoice = async (id, invoiceData) => {
    try {
        const {
            supplier_name,
            vat_number,
            invoice_number,
            date_of_sale,
            due_date,
            duzp,
            amount_without_VAT_21,
            VAT_21,
            amount_without_VAT_12,
            VAT_12,
            total_amount_with_VAT,
            reliable_VAT_payer
        } = invoiceData;

        const sql = `
            UPDATE invoices SET
                supplier_name = ?, vat_number = ?, invoice_number = ?,
                date_of_sale = ?, due_date = ?, duzp = ?,
                amount_without_VAT_21 = ?, VAT_21 = ?, amount_without_VAT_12 = ?,
                VAT_12 = ?, total_amount_with_VAT = ?, reliable_VAT_payer = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        const result = await runAsync(sql, [
            supplier_name, vat_number || '', invoice_number, date_of_sale || '',
            due_date || '', duzp, parseFloat(amount_without_VAT_21) || 0,
            parseFloat(VAT_21) || 0, parseFloat(amount_without_VAT_12) || 0,
            parseFloat(VAT_12) || 0, parseFloat(total_amount_with_VAT),
            reliable_VAT_payer, parseInt(id)
        ]);

        return result.changes > 0;
    } catch (error) {
        console.error('Error updating invoice:', error);
        throw error;
    }
};

// Delete invoice
const deleteInvoice = async (id) => {
    try {
        const sql = 'DELETE FROM invoices WHERE id = ?';
        const result = await runAsync(sql, [parseInt(id)]);
        return result.changes > 0;
    } catch (error) {
        console.error('Error deleting invoice:', error);
        throw error;
    }
};

// Get statistics
const getStatistics = async (quarter = null, year = null) => {
    try {
        const currentYear = year || new Date().getFullYear();
        const currentQuarter = quarter || Math.floor(new Date().getMonth() / 3) + 1;

        const quarterInvoices = await getInvoicesByQuarter(currentQuarter, currentYear);

        const yearInvoices = await allAsync(`
            SELECT * FROM invoices
            WHERE CAST(substr(duzp, 7, 4) AS INTEGER) = ?
        `, [parseInt(currentYear)]);

        const totalInvoices = quarterInvoices.length;
        const totalAmount = quarterInvoices.reduce((sum, invoice) =>
            sum + (parseFloat(invoice.total_amount_with_VAT) || 0), 0
        );

        const currentQuarterVAT = quarterInvoices.reduce((sum, invoice) =>
            sum + (parseFloat(invoice.VAT_21) || 0) + (parseFloat(invoice.VAT_12) || 0), 0
        );

        const ytdVAT = yearInvoices.reduce((sum, invoice) =>
            sum + (parseFloat(invoice.VAT_21) || 0) + (parseFloat(invoice.VAT_12) || 0), 0
        );

        return {
            totalInvoices,
            totalAmount,
            currentQuarterVAT,
            ytdVAT,
            quarter: currentQuarter,
            year: currentYear
        };
    } catch (error) {
        console.error('Error getting statistics:', error);
        throw error;
    }
};

// Get supplier statistics
const getSupplierStats = async (quarter = null, year = null) => {
    try {
        const currentYear = year || new Date().getFullYear();
        const currentQuarter = quarter || Math.floor(new Date().getMonth() / 3) + 1;

        const invoices = await getInvoicesByQuarter(currentQuarter, currentYear);

        const supplierStats = {};

        invoices.forEach(invoice => {
            const key = `${invoice.supplier_name}_${invoice.vat_number || ''}`;

            if (!supplierStats[key]) {
                supplierStats[key] = {
                    name: invoice.supplier_name,
                    vatNumber: invoice.vat_number || 'N/A',
                    totalAmount: 0,
                    totalVAT: 0,
                    invoiceCount: 0,
                    status: invoice.reliable_VAT_payer
                };
            }

            supplierStats[key].totalAmount += parseFloat(invoice.total_amount_with_VAT) || 0;
            supplierStats[key].totalVAT += (parseFloat(invoice.VAT_21) || 0) + (parseFloat(invoice.VAT_12) || 0);
            supplierStats[key].invoiceCount++;
        });

        return Object.values(supplierStats).sort((a, b) => b.totalAmount - a.totalAmount);
    } catch (error) {
        console.error('Error getting supplier stats:', error);
        throw error;
    }
};

// Get invoices by date range for Suppliers tab
const getInvoicesByDateRange = async (startDate, endDate) => {
    try {
        const sql = `
            SELECT * FROM invoices
            WHERE duzp IS NOT NULL
            ORDER BY duzp DESC, id DESC
        `;

        const allInvoices = await allAsync(sql);

        const filtered = allInvoices.filter(invoice => {
            if (!invoice.duzp) return false;

            const parts = invoice.duzp.split('.');
            if (parts.length !== 3) return false;

            const invoiceDate = new Date(
                parseInt(parts[2]),
                parseInt(parts[1]) - 1,
                parseInt(parts[0])
            );

            const start = new Date(startDate);
            const end = new Date(endDate);

            return invoiceDate >= start && invoiceDate <= end;
        });

        return filtered;
    } catch (error) {
        console.error('Error getting invoices by date range:', error);
        throw error;
    }
};

// Get supplier statistics by date range
const getSupplierStatsByDateRange = async (startDate, endDate) => {
    try {
        const invoices = await getInvoicesByDateRange(startDate, endDate);

        const supplierStats = {};

        invoices.forEach(invoice => {
            const vatNumber = invoice.vat_number && invoice.vat_number !== 'NA' ? invoice.vat_number : null;
            const key = vatNumber || `NO_VAT_${invoice.supplier_name}`;

            if (!supplierStats[key]) {
                supplierStats[key] = {
                    name: invoice.supplier_name,
                    vatNumber: vatNumber,
                    totalAmount: 0,
                    invoiceCount: 0
                };
            }

            supplierStats[key].totalAmount += parseFloat(invoice.total_amount_with_VAT) || 0;
            supplierStats[key].invoiceCount++;
        });

        return Object.values(supplierStats).sort((a, b) => b.totalAmount - a.totalAmount);
    } catch (error) {
        console.error('Error getting supplier stats by date range:', error);
        throw error;
    }
};

// Clear all invoices
const clearAllInvoices = async () => {
    try {
        const sql = 'DELETE FROM invoices';
        await runAsync(sql);
        return true;
    } catch (error) {
        console.error('Error clearing invoices:', error);
        throw error;
    }
};

// Close database connection
const closeDatabase = () => {
    return new Promise((resolve) => {
        if (isDbClosed) {
            console.log('Database already closed');
            resolve();
            return;
        }

        isDbClosed = true;
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err);
            } else {
                console.log('Mistral database connection closed');
            }
            resolve();
        });
    });
};

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
    if (isShuttingDown) {
        console.log('Shutdown already in progress...');
        return;
    }

    isShuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down gracefully...`);

    try {
        await closeDatabase();
        console.log('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        console.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
};

// Handle multiple shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    await gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    await gracefulShutdown('unhandledRejection');
});

module.exports = {
    initDatabase,
    addInvoice,
    getAllInvoices,
    findInvoice,
    getInvoicesByQuarter,
    updateInvoice,
    deleteInvoice,
    getStatistics,
    getSupplierStats,
    getInvoicesByDateRange,
    getSupplierStatsByDateRange,
    clearAllInvoices,
    closeDatabase
};
