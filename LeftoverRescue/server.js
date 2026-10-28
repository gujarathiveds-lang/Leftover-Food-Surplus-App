const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');

const USERS_FILE = path.join(DATA_DIR, 'users.json');
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
const RESERVATIONS_FILE = path.join(DATA_DIR, 'reservations.json');

// ============================================================
// INITIALIZATION
// ============================================================

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

function initializeJSON(filePath) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, '[]', 'utf8');
    }
}

initializeJSON(USERS_FILE);
initializeJSON(LISTINGS_FILE);
initializeJSON(RESERVATIONS_FILE);

function readJSON(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content || '[]');

        if (!Array.isArray(data)) {
            throw new Error('Expected a JSON array.');
        }

        return data;
    } catch (error) {
        console.error(`Could not read ${filePath}:`, error.message);
        throw new Error('Could not read application data.');
    }
}

function writeJSON(filePath, data) {
    const temporaryFile = `${filePath}.tmp`;

    fs.writeFileSync(
        temporaryFile,
        JSON.stringify(data, null, 2),
        'utf8'
    );

    fs.renameSync(temporaryFile, filePath);
}

function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;
}

function normalizeUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
    };
}

// ============================================================
// MIDDLEWARE
// ============================================================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({
    extended: true,
    limit: '1mb'
}));

app.use(session({
    name: 'leftover.sid',
    secret:
        process.env.SESSION_SECRET ||
        'leftover-rescue-local-demo-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000
    }
}));

if (fs.existsSync(PUBLIC_DIR)) {
    app.use(express.static(PUBLIC_DIR));
}

// ============================================================
// AUTHORIZATION HELPERS
// ============================================================

function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'Please log in first.'
        });
    }

    return next();
}

function requireRole(role) {
    return (req, res, next) => {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                error: 'Please log in first.'
            });
        }

        if (req.session.user.role !== role) {
            return res.status(403).json({
                error: 'You do not have permission to perform this action.'
            });
        }

        return next();
    };
}

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', (req, res) => {
    return res.json({
        success: true,
        message: 'Leftover Rescue server is running.'
    });
});

// ============================================================
// AUTHENTICATION
// ============================================================

// Get the current session.
app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.json({
            user: null
        });
    }

    return res.json({
        user: req.session.user
    });
});

// Register an account.
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (
            typeof name !== 'string' ||
            !name.trim() ||
            typeof email !== 'string' ||
            !email.trim() ||
            typeof password !== 'string' ||
            !password ||
            !role
        ) {
            return res.status(400).json({
                error: 'Please fill in every required field.'
            });
        }

        if (!['customer', 'business'].includes(role)) {
            return res.status(400).json({
                error: 'Please select a valid account type.'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: 'Password must be at least 6 characters.'
            });
        }

        const normalizedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();

        if (
            normalizedEmail.length > 254 ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
        ) {
            return res.status(400).json({
                error: 'Please enter a valid email address.'
            });
        }

        const users = readJSON(USERS_FILE);

        const existingUser = users.find(
            user =>
                String(user.email).trim().toLowerCase() ===
                normalizedEmail
        );

        if (existingUser) {
            return res.status(409).json({
                error: 'An account with that email already exists.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = {
            id: createId('u'),
            name: normalizedName,
            email: normalizedEmail,
            password: passwordHash,
            role,
            createdAt: new Date().toISOString()
        };

        users.push(user);
        writeJSON(USERS_FILE, users);

        // Regenerate the session to prevent session fixation.
        req.session.regenerate(error => {
            if (error) {
                console.error('Session regeneration error:', error);

                return res.status(500).json({
                    error: 'Account created, but login failed. Please log in.'
                });
            }

            req.session.user = normalizeUser(user);

            req.session.save(saveError => {
                if (saveError) {
                    console.error('Session save error:', saveError);

                    return res.status(500).json({
                        error: 'Account created, but login failed. Please log in.'
                    });
                }

                return res.status(201).json({
                    success: true,
                    user: req.session.user
                });
            });
        });
    } catch (error) {
        console.error('Registration error:', error);

        return res.status(500).json({
            error: 'Could not create account.'
        });
    }
});

// Log in.
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (
            typeof email !== 'string' ||
            !email.trim() ||
            typeof password !== 'string' ||
            !password
        ) {
            return res.status(400).json({
                error: 'Enter your email and password.'
            });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const users = readJSON(USERS_FILE);

        const user = users.find(
            item =>
                String(item.email).trim().toLowerCase() ===
                normalizedEmail
        );

        if (!user || !user.password) {
            return res.status(401).json({
                error: 'Invalid email or password.'
            });
        }

        let passwordMatches = false;

        try {
            passwordMatches = await bcrypt.compare(
                password,
                user.password
            );
        } catch (compareError) {
            console.error('Password comparison error:', compareError);
        }

        if (!passwordMatches) {
            return res.status(401).json({
                error: 'Invalid email or password.'
            });
        }

        req.session.regenerate(error => {
            if (error) {
                console.error('Session regeneration error:', error);

                return res.status(500).json({
                    error: 'Could not start your session.'
                });
            }

            req.session.user = normalizeUser(user);

            req.session.save(saveError => {
                if (saveError) {
                    console.error('Login session error:', saveError);

                    return res.status(500).json({
                        error: 'Could not start your session.'
                    });
                }

                return res.json({
                    success: true,
                    user: req.session.user
                });
            });
        });
    } catch (error) {
        console.error('Login error:', error);

        return res.status(500).json({
            error: 'Could not log in.'
        });
    }
});

// Log out.
app.post('/api/auth/logout', (req, res) => {
    if (!req.session) {
        res.clearCookie('leftover.sid');

        return res.json({
            success: true
        });
    }

    req.session.destroy(error => {
        if (error) {
            console.error('Logout error:', error);

            return res.status(500).json({
                error: 'Could not log out.'
            });
        }

        res.clearCookie('leftover.sid');

        return res.json({
            success: true
        });
    });
});

// ============================================================
// LISTINGS
// ============================================================

// Get all available listings.
app.get('/api/listings', (req, res) => {
    try {
        const listings = readJSON(LISTINGS_FILE);
        const users = readJSON(USERS_FILE);

        const availableListings = listings
            .filter(listing =>
                listing.status !== 'deleted' &&
                listing.status !== 'unavailable' &&
                Number(listing.quantity) > 0
            )
            .map(listing => {
                const business = users.find(
                    user =>
                        String(user.id) ===
                        String(listing.businessId)
                );

                return {
                    ...listing,
                    businessName:
                        listing.businessName ||
                        (business && business.name) ||
                        'Local business'
                };
            });

        return res.json(availableListings);
    } catch (error) {
        console.error('Listings error:', error);

        return res.status(500).json({
            error: 'Could not load listings.'
        });
    }
});

// Get listings created by the logged-in business.
app.get(
    '/api/listings/business',
    requireRole('business'),
    (req, res) => {
        try {
            const listings = readJSON(LISTINGS_FILE);

            return res.json(
                listings.filter(
                    listing =>
                        String(listing.businessId) ===
                        String(req.session.user.id)
                )
            );
        } catch (error) {
            console.error('Business listings error:', error);

            return res.status(500).json({
                error: 'Could not load your listings.'
            });
        }
    }
);

// Create a listing.
app.post(
    '/api/listings',
    requireRole('business'),
    (req, res) => {
        try {
            const {
                title,
                description,
                price,
                quantity,
                pickupWindow,
                category
            } = req.body;

            if (
                typeof title !== 'string' ||
                !title.trim() ||
                price === undefined ||
                quantity === undefined
            ) {
                return res.status(400).json({
                    error: 'Title, price, and quantity are required.'
                });
            }

            const numericPrice = Number(price);
            const numericQuantity = Number(quantity);

            if (
                !Number.isFinite(numericPrice) ||
                numericPrice < 0 ||
                !Number.isInteger(numericQuantity) ||
                numericQuantity < 1
            ) {
                return res.status(400).json({
                    error: 'Enter a valid price and a whole-number quantity.'
                });
            }

            const listings = readJSON(LISTINGS_FILE);

            const listing = {
                id: createId('l'),
                businessId: req.session.user.id,
                businessName: req.session.user.name,
                title: title.trim(),
                description:
                    typeof description === 'string'
                        ? description.trim()
                        : '',
                price: numericPrice,
                quantity: numericQuantity,
                pickupWindow:
                    typeof pickupWindow === 'string' &&
                    pickupWindow.trim()
                        ? pickupWindow.trim()
                        : 'Contact business',
                category:
                    typeof category === 'string' &&
                    category.trim()
                        ? category.trim()
                        : 'Other',
                status: 'available',
                createdAt: new Date().toISOString()
            };

            listings.push(listing);
            writeJSON(LISTINGS_FILE, listings);

            return res.status(201).json({
                success: true,
                listing
            });
        } catch (error) {
            console.error('Create listing error:', error);

            return res.status(500).json({
                error: 'Could not create listing.'
            });
        }
    }
);

// Delete a business's listing if it has no pending reservations.
app.delete(
    '/api/listings/:id',
    requireRole('business'),
    (req, res) => {
        try {
            const listings = readJSON(LISTINGS_FILE);
            const reservations = readJSON(RESERVATIONS_FILE);

            const listing = listings.find(
                item => String(item.id) === String(req.params.id)
            );

            if (!listing || listing.status === 'deleted') {
                return res.status(404).json({
                    error: 'Listing not found.'
                });
            }

            if (
                String(listing.businessId) !==
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    error: 'You cannot delete another business’s listing.'
                });
            }

            const hasPendingReservations = reservations.some(
                reservation =>
                    String(reservation.listingId) ===
                        String(listing.id) &&
                    reservation.status === 'pending'
            );

            if (hasPendingReservations) {
                return res.status(409).json({
                    error:
                        'Cancel or complete pending reservations before deleting this listing.'
                });
            }

            listing.status = 'deleted';
            listing.deletedAt = new Date().toISOString();

            writeJSON(LISTINGS_FILE, listings);

            return res.json({
                success: true
            });
        } catch (error) {
            console.error('Delete listing error:', error);

            return res.status(500).json({
                error: 'Could not delete listing.'
            });
        }
    }
);

// ============================================================
// RESERVATIONS
// ============================================================

// Reserve food.
app.post(
    '/api/reservations',
    requireRole('customer'),
    (req, res) => {
        try {
            const { listingId, quantity } = req.body;
            const requestedQuantity = Number(quantity);

            if (
                listingId === undefined ||
                listingId === null ||
                String(listingId).trim() === '' ||
                !Number.isInteger(requestedQuantity) ||
                requestedQuantity < 1
            ) {
                return res.status(400).json({
                    error: 'Choose a valid listing and quantity.'
                });
            }

            const listings = readJSON(LISTINGS_FILE);
            const reservations = readJSON(RESERVATIONS_FILE);

            const listing = listings.find(
                item => String(item.id) === String(listingId)
            );

            if (
                !listing ||
                listing.status === 'deleted' ||
                listing.status === 'unavailable'
            ) {
                return res.status(404).json({
                    error: 'This listing is no longer available.'
                });
            }

            const availableQuantity = Number(listing.quantity);

            if (
                !Number.isInteger(availableQuantity) ||
                availableQuantity < 1
            ) {
                return res.status(400).json({
                    error: 'This listing is sold out.'
                });
            }

            if (availableQuantity < requestedQuantity) {
                return res.status(400).json({
                    error: 'Not enough items are available.'
                });
            }

            if (
                String(listing.businessId) ===
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    error: 'You cannot reserve your own listing.'
                });
            }

            const fallbackPrice =
                listing.price !== undefined
                    ? listing.price
                    : listing.discountPrice !== undefined
                        ? listing.discountPrice
                        : 0;

            const numericPrice = Number(fallbackPrice);

            if (
                !Number.isFinite(numericPrice) ||
                numericPrice < 0
            ) {
                return res.status(400).json({
                    error: 'This listing has an invalid price.'
                });
            }

            const reservation = {
                id: createId('r'),
                listingId: listing.id,
                listingTitle: listing.title || 'Food listing',
                customerId: req.session.user.id,
                customerName: req.session.user.name,
                businessId: listing.businessId,
                businessName:
                    listing.businessName || 'Local business',
                quantity: requestedQuantity,
                price: numericPrice,
                totalPrice: Number(
                    (numericPrice * requestedQuantity).toFixed(2)
                ),
                status: 'pending',
                createdAt: new Date().toISOString()
            };

            const previousListings = JSON.stringify(listings);
            const previousReservations = JSON.stringify(reservations);

            listing.quantity =
                availableQuantity - requestedQuantity;

            reservations.push(reservation);

            try {
                writeJSON(LISTINGS_FILE, listings);
                writeJSON(RESERVATIONS_FILE, reservations);
            } catch (error) {
                try {
                    writeJSON(
                        LISTINGS_FILE,
                        JSON.parse(previousListings)
                    );

                    writeJSON(
                        RESERVATIONS_FILE,
                        JSON.parse(previousReservations)
                    );
                } catch (rollbackError) {
                    console.error(
                        'Reservation rollback error:',
                        rollbackError
                    );
                }

                throw error;
            }

            return res.status(201).json({
                success: true,
                reservation
            });
        } catch (error) {
            console.error('Reservation creation error:', error);

            return res.status(500).json({
                error: 'Could not create reservation.'
            });
        }
    }
);

// Cancel a customer's reservation.
app.post(
    '/api/reservations/:id/cancel',
    requireRole('customer'),
    (req, res) => {
        try {
            const reservations = readJSON(RESERVATIONS_FILE);
            const listings = readJSON(LISTINGS_FILE);

            const reservation = reservations.find(
                item => String(item.id) === String(req.params.id)
            );

            if (!reservation) {
                return res.status(404).json({
                    error: 'Reservation not found.'
                });
            }

            if (
                String(reservation.customerId) !==
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    error: 'You cannot cancel this reservation.'
                });
            }

            if (reservation.status !== 'pending') {
                return res.status(400).json({
                    error: 'Only pending reservations can be cancelled.'
                });
            }

            const listing = listings.find(
                item =>
                    String(item.id) ===
                    String(reservation.listingId)
            );

            const previousListings = JSON.stringify(listings);
            const previousReservations = JSON.stringify(reservations);

            if (listing && listing.status !== 'deleted') {
                listing.quantity =
                    Number(listing.quantity) +
                    Number(reservation.quantity);
            }

            reservation.status = 'cancelled';
            reservation.cancelledAt = new Date().toISOString();

            try {
                writeJSON(LISTINGS_FILE, listings);
                writeJSON(RESERVATIONS_FILE, reservations);
            } catch (error) {
                try {
                    writeJSON(
                        LISTINGS_FILE,
                        JSON.parse(previousListings)
                    );

                    writeJSON(
                        RESERVATIONS_FILE,
                        JSON.parse(previousReservations)
                    );
                } catch (rollbackError) {
                    console.error(
                        'Cancellation rollback error:',
                        rollbackError
                    );
                }

                throw error;
            }

            return res.json({
                success: true,
                message: 'Reservation cancelled successfully.'
            });
        } catch (error) {
            console.error('Cancellation error:', error);

            return res.status(500).json({
                error: 'Server error while cancelling reservation.'
            });
        }
    }
);

// Get the logged-in customer's reservations.
app.get(
    '/api/reservations/customer',
    requireRole('customer'),
    (req, res) => {
        try {
            const reservations = readJSON(RESERVATIONS_FILE);

            return res.json(
                reservations.filter(
                    reservation =>
                        String(reservation.customerId) ===
                        String(req.session.user.id)
                )
            );
        } catch (error) {
            console.error('Customer reservations error:', error);

            return res.status(500).json({
                error: 'Could not load your reservations.'
            });
        }
    }
);

// Get reservations for the logged-in business.
app.get(
    '/api/reservations/business',
    requireRole('business'),
    (req, res) => {
        try {
            const reservations = readJSON(RESERVATIONS_FILE);

            return res.json(
                reservations.filter(
                    reservation =>
                        String(reservation.businessId) ===
                        String(req.session.user.id)
                )
            );
        } catch (error) {
            console.error('Business reservations error:', error);

            return res.status(500).json({
                error: 'Could not load business reservations.'
            });
        }
    }
);

// Update a reservation's status as its business.
app.patch(
    '/api/reservations/:id',
    requireRole('business'),
    (req, res) => {
        try {
            const { status } = req.body;

            const allowedStatuses = [
                'confirmed',
                'completed',
                'cancelled'
            ];

            if (!allowedStatuses.includes(status)) {
                return res.status(400).json({
                    error: 'Invalid reservation status.'
                });
            }

            const reservations = readJSON(RESERVATIONS_FILE);
            const listings = readJSON(LISTINGS_FILE);

            const reservation = reservations.find(
                item => String(item.id) === String(req.params.id)
            );

            if (!reservation) {
                return res.status(404).json({
                    error: 'Reservation not found.'
                });
            }

            if (
                String(reservation.businessId) !==
                String(req.session.user.id)
            ) {
                return res.status(403).json({
                    error: 'You cannot update this reservation.'
                });
            }

            if (reservation.status !== 'pending') {
                return res.status(400).json({
                    error: 'Only pending reservations can be updated.'
                });
            }

            const previousListings = JSON.stringify(listings);
            const previousReservations = JSON.stringify(reservations);

            // Return stock if the business cancels a reservation.
            if (status === 'cancelled') {
                const listing = listings.find(
                    item =>
                        String(item.id) ===
                        String(reservation.listingId)
                );

                if (listing && listing.status !== 'deleted') {
                    listing.quantity =
                        Number(listing.quantity) +
                        Number(reservation.quantity);
                }

                reservation.cancelledAt = new Date().toISOString();
            }

            reservation.status = status;
            reservation.updatedAt = new Date().toISOString();

            try {
                if (status === 'cancelled') {
                    writeJSON(LISTINGS_FILE, listings);
                }

                writeJSON(RESERVATIONS_FILE, reservations);
            } catch (error) {
                try {
                    writeJSON(
                        LISTINGS_FILE,
                        JSON.parse(previousListings)
                    );

                    writeJSON(
                        RESERVATIONS_FILE,
                        JSON.parse(previousReservations)
                    );
                } catch (rollbackError) {
                    console.error(
                        'Reservation update rollback error:',
                        rollbackError
                    );
                }

                throw error;
            }

            return res.json({
                success: true,
                reservation
            });
        } catch (error) {
            console.error('Update reservation error:', error);

            return res.status(500).json({
                error: 'Could not update reservation.'
            });
        }
    }
);

// ============================================================
// FALLBACK ROUTES
// ============================================================

// Send the app page for non-API routes.
// Compatible with Express 4 and Express 5.
app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }

    res.sendFile(
        path.join(PUBLIC_DIR, 'index.html'),
        error => {
            if (error) {
                next(error);
            }
        }
    );
});

// Handle unknown API endpoints.
app.use('/api', (req, res) => {
    return res.status(404).json({
        error: 'API endpoint not found.'
    });
});

// General error handler.
app.use((error, req, res, next) => {
    console.error('Unhandled server error:', error);

    if (res.headersSent) {
        return next(error);
    }

    return res.status(500).json({
        error: 'An unexpected server error occurred.'
    });
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, () => {
    console.log(
        `Leftover Rescue is running at http://localhost:${PORT}`
    );
});