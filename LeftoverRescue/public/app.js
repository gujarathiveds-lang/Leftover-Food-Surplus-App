let currentUser = null;
let currentListings = [];
let isRegisterMode = false;

document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    checkSession();
});

function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    })[char]);
}

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options,
        headers: {
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...(options.headers || {})
        }
    });

    const data = await readJson(response);

    if (!response.ok) {
        throw new Error(
            data.error || data.message || `Request failed (${response.status}).`
        );
    }

    return data;
}

// -------------------- EVENT LISTENERS --------------------

function setupEventListeners() {
    const authForm = document.getElementById('auth-form');

    if (authForm) {
        authForm.addEventListener('submit', handleAuthentication);
    }

    const toggleLink = document.getElementById('auth-toggle-link');

    if (toggleLink) {
        toggleLink.addEventListener('click', event => {
            event.preventDefault();

            isRegisterMode = !isRegisterMode;

            document.getElementById('auth-title').textContent =
                isRegisterMode ? 'Create Account' : 'Sign In';

            document.getElementById('auth-submit-btn').textContent =
                isRegisterMode ? 'Register' : 'Login';

            document.getElementById('auth-toggle-msg').textContent =
                isRegisterMode
                    ? 'Already have an account?'
                    : "Don't have an account?";

            toggleLink.textContent =
                isRegisterMode ? 'Login here' : 'Register here';

            document.querySelectorAll('.toggle-reg').forEach(element => {
                element.classList.toggle('hidden', !isRegisterMode);
            });

            const nameInput = document.getElementById('auth-name');
            const roleInput = document.getElementById('auth-role');

            if (nameInput) nameInput.required = isRegisterMode;
            if (roleInput) roleInput.required = isRegisterMode;
        });
    }

    const listingForm = document.getElementById('listing-form');

    if (listingForm) {
        listingForm.addEventListener('submit', createListing);
    }
}

// -------------------- LOGIN AND REGISTRATION --------------------

async function handleAuthentication(event) {
    event.preventDefault();

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();
    const role = document.getElementById('auth-role').value;

    if (isRegisterMode && !name) {
        showAlert('Please enter your name or business name.', 'danger');
        return;
    }

    const endpoint = isRegisterMode
        ? '/api/auth/register'
        : '/api/auth/login';

    const payload = isRegisterMode
        ? { name, email, password, role }
        : { email, password };

    try {
        const data = await apiRequest(endpoint, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (!data.user) {
            throw new Error('The server did not return account information.');
        }

        currentUser = data.user;
        isRegisterMode = false;

        document.getElementById('auth-form').reset();

        document.querySelectorAll('.toggle-reg').forEach(element => {
            element.classList.add('hidden');
        });

        document.getElementById('auth-title').textContent = 'Sign In';
        document.getElementById('auth-submit-btn').textContent = 'Login';
        document.getElementById('auth-toggle-msg').textContent =
            "Don't have an account?";
        document.getElementById('auth-toggle-link').textContent = 'Register here';

        updateNavbar();

        showAlert(
            'Welcome, ' + (currentUser.name || 'user') + '!',
            'success'
        );

        if (currentUser.role === 'business') {
            showView('business-dashboard');
        } else {
            showView('explore');
        }
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// -------------------- SESSION --------------------

async function checkSession() {
    try {
        const data = await apiRequest('/api/auth/me');
        currentUser = data.user || null;
    } catch {
        currentUser = null;
    }

    updateNavbar();

    if (currentUser) {
        if (currentUser.role === 'business') {
            showView('business-dashboard');
        } else {
            showView('explore');
        }
    } else {
        showView('home');
    }
}

function updateNavbar() {
    const nav = document.getElementById('nav-links');

    if (!nav) return;

    if (!currentUser) {
        nav.innerHTML = `
            <a href="#" onclick="showView('explore'); return false;">
                Browse Surplus
            </a>
            <a href="#" onclick="showView('auth'); return false;">
                Login / Register
            </a>
        `;

        return;
    }

    const safeName = escapeHTML(currentUser.name || 'User');

    if (currentUser.role === 'business') {
        nav.innerHTML = `
            <a href="#" onclick="showView('explore'); return false;">
                Marketplace
            </a>
            <a href="#" onclick="showView('business-dashboard'); return false;">
                Merchant Dashboard
            </a>
            <a href="#" onclick="handleLogout(); return false;">
                Sign Out (${safeName})
            </a>
        `;
    } else {
        nav.innerHTML = `
            <a href="#" onclick="showView('explore'); return false;">
                Browse Food
            </a>
            <a href="#" onclick="showView('customer-dashboard'); return false;">
                My Reservations
            </a>
            <a href="#" onclick="handleLogout(); return false;">
                Sign Out (${safeName})
            </a>
        `;
    }
}

async function handleLogout() {
    try {
        await apiRequest('/api/auth/logout', {
            method: 'POST'
        });

        currentUser = null;
        updateNavbar();
        showView('home');

        showAlert('You have been logged out.', 'success');
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// -------------------- NAVIGATION --------------------

function showView(viewId) {
    const allowedViews = [
        'home',
        'auth',
        'explore',
        'customer-dashboard',
        'business-dashboard'
    ];

    if (!allowedViews.includes(viewId)) {
        viewId = 'home';
    }

    // Require the appropriate account for dashboards.
    if (viewId === 'customer-dashboard') {
        if (!currentUser) {
            viewId = 'auth';
        } else if (currentUser.role !== 'customer') {
            viewId = 'business-dashboard';
        }
    }

    if (viewId === 'business-dashboard') {
        if (!currentUser) {
            viewId = 'auth';
        } else if (currentUser.role !== 'business') {
            viewId = 'customer-dashboard';
        }
    }

    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });

    const target = document.getElementById('view-' + viewId);

    if (target) {
        target.classList.remove('hidden');
    } else {
        console.error('Could not find page section:', 'view-' + viewId);
        showAlert('A page section is missing from index.html.', 'danger');
        return;
    }

    if (viewId === 'explore') {
        loadMarketplaceListings();
    }

    if (viewId === 'customer-dashboard') {
        loadCustomerDashboard();
    }

    if (viewId === 'business-dashboard') {
        loadBusinessDashboard();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -------------------- MARKETPLACE --------------------

async function loadMarketplaceListings() {
    const grid = document.getElementById('listings-grid');

    if (!grid) {
        console.error('Missing #listings-grid in index.html.');
        return;
    }

    grid.innerHTML = '<p>Loading available food...</p>';

    try {
        const listings = await apiRequest('/api/listings');

        currentListings = Array.isArray(listings) ? listings : [];

        if (currentListings.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>No surplus food is available right now.</h3>
                    <p>Check back later for new listings!</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = currentListings.map(item => {
            const id = escapeHTML(item.id);
            const title = escapeHTML(item.title);
            const businessName = escapeHTML(item.businessName || 'Local business');
            const pickupWindow = escapeHTML(item.pickupWindow || 'Contact business');
            const quantity = Number(item.quantity) || 0;

            const discountedPrice = Number(
                item.price ?? item.discountPrice ?? 0
            );

            const originalPrice = Number(
                item.originalPrice ?? item.price ?? item.discountPrice ?? 0
            );

            let buttonHTML = '';

            if (!currentUser) {
                buttonHTML = `
                    <button class="btn-primary"
                        onclick="showView('auth')">
                        Login to Reserve
                    </button>
                `;
            } else if (currentUser.role === 'customer') {
                buttonHTML = `
                    <button class="btn-primary"
                        onclick="reserveItem('${id}')">
                        Reserve Food
                    </button>
                `;
            } else {
                buttonHTML = `
                    <button class="btn-primary" disabled>
                        Business Account
                    </button>
                `;
            }

            return `
                <div class="food-card">
                    <div>
                        <div class="store-tag">🏪 ${businessName}</div>
                        <h3>${title}</h3>
                        <p class="pickup-txt">
                            Pickup: <strong>${pickupWindow}</strong>
                        </p>
                        <p class="qty-txt">
                            Available: <span>${quantity}</span>
                        </p>
                    </div>

                    <div class="card-footer">
                        <div class="price-container">
                            <span class="discount-price">
                                $${discountedPrice.toFixed(2)}
                            </span>
                            <span class="original-price">
                                $${originalPrice.toFixed(2)}
                            </span>
                        </div>
                        ${buttonHTML}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Marketplace error:', error);

        grid.innerHTML = `
            <p class="error-txt">
                Could not load marketplace: ${escapeHTML(error.message)}
            </p>
        `;
    }
}

// -------------------- RESERVATIONS --------------------

async function reserveItem(listingId) {
    if (!currentUser || currentUser.role !== 'customer') {
        showAlert('Please log in with a customer account.', 'danger');
        showView('auth');
        return;
    }

    const listing = currentListings.find(
        item => String(item.id) === String(listingId)
    );

    if (!listing) {
        showAlert('This listing is no longer available.', 'danger');
        await loadMarketplaceListings();
        return;
    }

    const quantityText = prompt(
        `How many would you like to reserve? Available: ${listing.quantity}`,
        '1'
    );

    if (quantityText === null) return;

    const quantity = Number(quantityText);

    if (
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > Number(listing.quantity)
    ) {
        showAlert('Please enter a valid available quantity.', 'danger');
        return;
    }

    try {
        await apiRequest('/api/reservations', {
            method: 'POST',
            body: JSON.stringify({ listingId, quantity })
        });

        showAlert('Your reservation was created!', 'success');

        showView('customer-dashboard');
        await loadMarketplaceListings();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function loadCustomerDashboard() {
    const tbody = document.getElementById('customer-reservations-table');

    if (!tbody) {
        console.error('Missing #customer-reservations-table in index.html.');
        return;
    }

    if (!currentUser || currentUser.role !== 'customer') {
        tbody.innerHTML = `
            <tr><td colspan="6">Log in with a customer account to see reservations.</td></tr>
        `;
        return;
    }

    tbody.innerHTML = `
        <tr><td colspan="6">Loading reservations...</td></tr>
    `;

    try {
        const reservations = await apiRequest('/api/reservations/customer');

        if (!Array.isArray(reservations) || reservations.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-table">
                        You have no reservations yet.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = reservations.map(reservation => {
            const id = escapeHTML(reservation.id);
            const title = escapeHTML(reservation.listingTitle || 'Food item');
            const businessName = escapeHTML(
                reservation.businessName || 'Local business'
            );

            const quantity = Number(reservation.quantity) || 0;
            const price = Number(
                reservation.price ?? reservation.discountPrice ?? 0
            );
            const pickupWindow = escapeHTML(
                reservation.pickupWindow || 'Contact business'
            );

            const status = String(
                reservation.status || 'pending'
            ).toLowerCase();

            const cancelButton = status === 'pending'
                ? `
                    <br>
                    <button class="btn-danger"
                        onclick="cancelReservation('${id}')">
                        Cancel
                    </button>
                `
                : '';

            return `
                <tr>
                    <td>${title}</td>
                    <td>${businessName}</td>
                    <td>${quantity}</td>
                    <td>$${(price * quantity).toFixed(2)}</td>
                    <td>${pickupWindow}</td>
                    <td>
                        <span class="status-badge">
                            ${escapeHTML(status.toUpperCase())}
                        </span>
                        ${cancelButton}
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Customer reservations error:', error);

        tbody.innerHTML = `
            <tr>
                <td colspan="6">
                    Could not load reservations: ${escapeHTML(error.message)}
                </td>
            </tr>
        `;
    }
}

async function cancelReservation(reservationId) {
    if (!confirm('Are you sure you want to cancel this reservation?')) {
        return;
    }

    try {
        const data = await apiRequest(
            `/api/reservations/${encodeURIComponent(reservationId)}/cancel`,
            { method: 'POST' }
        );

        showAlert(
            data.message || 'Reservation cancelled successfully.',
            'success'
        );

        await loadCustomerDashboard();
        await loadMarketplaceListings();
    } catch (error) {
        console.error('Cancellation error:', error);
        showAlert(error.message, 'danger');
    }
}

// -------------------- BUSINESS DASHBOARD --------------------

async function loadBusinessDashboard() {
    if (!currentUser || currentUser.role !== 'business') {
        return;
    }

    await Promise.all([
        loadBusinessListings(),
        loadBusinessReservations()
    ]);
}

async function loadBusinessListings() {
    const tbody = document.getElementById('business-listings-table');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6">Loading listings...</td></tr>';

    try {
        const listings = await apiRequest('/api/listings/business');

        if (!Array.isArray(listings) || listings.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="6">No listings have been created yet.</td></tr>
            `;
            return;
        }

        tbody.innerHTML = listings.map(item => {
            const id = escapeHTML(item.id);

            const originalPrice = Number(
                item.originalPrice ?? item.price ?? item.discountPrice ?? 0
            );

            const salePrice = Number(
                item.price ?? item.discountPrice ?? 0
            );

            return `
                <tr>
                    <td>${escapeHTML(item.title)}</td>
                    <td>$${originalPrice.toFixed(2)}</td>
                    <td>$${salePrice.toFixed(2)}</td>
                    <td>${Number(item.quantity) || 0} units</td>
                    <td>${escapeHTML(item.pickupWindow || '')}</td>
                    <td>
                        ${
                            item.status === 'deleted'
                                ? 'Deleted'
                                : `<button class="btn-danger"
                                    onclick="deleteListing('${id}')">
                                    Remove
                                </button>`
                        }
                    </td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Business listings error:', error);

        tbody.innerHTML = `
            <tr><td colspan="6">${escapeHTML(error.message)}</td></tr>
        `;
    }
}

async function loadBusinessReservations() {
    const tbody = document.getElementById('business-orders-table');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Loading reservations...</td></tr>';

    try {
        const reservations = await apiRequest('/api/reservations/business');

        if (!Array.isArray(reservations) || reservations.length === 0) {
            tbody.innerHTML = `
                <tr><td colspan="5">No reservations yet.</td></tr>
            `;
            return;
        }

        tbody.innerHTML = reservations.map(reservation => {
            const id = escapeHTML(reservation.id);
            const status = String(
                reservation.status || 'pending'
            ).toLowerCase();

            let actionHTML = '';

            if (status === 'pending') {
                actionHTML = `
                    <button class="btn-primary"
                        onclick="updateOrderStatus('${id}', 'confirmed')">
                        Confirm
                    </button>
                    <button class="btn-success"
                        onclick="updateOrderStatus('${id}', 'completed')">
                        Complete
                    </button>
                `;
            } else {
                actionHTML = escapeHTML(status);
            }

            return `
                <tr>
                    <td>${escapeHTML(reservation.customerName || 'Customer')}</td>
                    <td>${escapeHTML(reservation.listingTitle || 'Food item')}</td>
                    <td>${Number(reservation.quantity) || 0}</td>
                    <td>${escapeHTML(status.toUpperCase())}</td>
                    <td>${actionHTML}</td>
                </tr>
            `;
        }).join('');
    } catch (error) {
        console.error('Business reservations error:', error);

        tbody.innerHTML = `
            <tr><td colspan="5">${escapeHTML(error.message)}</td></tr>
        `;
    }
}

async function createListing(event) {
    event.preventDefault();

    if (!currentUser || currentUser.role !== 'business') {
        showAlert('Log in with a business account first.', 'danger');
        return;
    }

    const title = document.getElementById('listing-title').value.trim();

    const originalPrice = Number(
        document.getElementById('listing-original-price').value
    );

    const discountPrice = Number(
        document.getElementById('listing-discount-price').value
    );

    const quantity = Number(
        document.getElementById('listing-quantity').value
    );

    const pickupWindow = document.getElementById('listing-pickup').value.trim();

    if (
        !title ||
        !Number.isFinite(originalPrice) ||
        !Number.isFinite(discountPrice) ||
        !Number.isInteger(quantity) ||
        originalPrice < 0 ||
        discountPrice < 0 ||
        quantity < 1 ||
        !pickupWindow
    ) {
        showAlert('Please enter valid listing information.', 'danger');
        return;
    }

    try {
        await apiRequest('/api/listings', {
            method: 'POST',
            body: JSON.stringify({
                title,
                originalPrice,
                discountPrice,
                price: discountPrice,
                quantity,
                pickupWindow
            })
        });

        document.getElementById('listing-form').reset();
        closeListingModal();

        showAlert('Your food listing was published!', 'success');

        await loadBusinessDashboard();
        await loadMarketplaceListings();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function deleteListing(id) {
    if (!confirm('Are you sure you want to remove this listing?')) {
        return;
    }

    try {
        await apiRequest(`/api/listings/${encodeURIComponent(id)}`, {
            method: 'DELETE'
        });

        showAlert('Listing removed successfully.', 'success');

        await loadBusinessDashboard();
        await loadMarketplaceListings();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

async function updateOrderStatus(id, status) {
    try {
        await apiRequest(`/api/reservations/${encodeURIComponent(id)}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });

        showAlert('Reservation status updated.', 'success');

        await loadBusinessReservations();
    } catch (error) {
        showAlert(error.message, 'danger');
    }
}

// -------------------- LISTING MODAL --------------------

function openListingModal() {
    const modal = document.getElementById('listing-modal');

    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeListingModal() {
    const modal = document.getElementById('listing-modal');

    if (modal) {
        modal.classList.add('hidden');
    }
}

// -------------------- ALERTS --------------------

function showAlert(message, type = 'success') {
    const banner = document.getElementById('alert-banner');

    if (!banner) {
        console.log(message);
        return;
    }

    banner.textContent = message;
    banner.className = `alert alert-${type}`;
    banner.classList.remove('hidden');

    window.clearTimeout(showAlert.timeoutId);

    showAlert.timeoutId = window.setTimeout(() => {
        banner.classList.add('hidden');
    }, 5000);
}