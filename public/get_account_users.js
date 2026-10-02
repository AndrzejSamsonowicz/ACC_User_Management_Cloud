// Account Users Management
// The "Account users" dialog (Forma look: shared/forma-dialogs.css, .au-*),
// plus fetchAllAccountUsers*, which other modules use to read the account's users.
class AccountUsersManager {
    constructor() {
        this.currentAccessToken = null;
        this.createModal();
    }

    setAccessToken(token) {
        this.currentAccessToken = token;
    }

    createModal() {
        const searchIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3" stroke-linecap="round"/></svg>';
        const filter = (col, label, example) => `
            <td><label class="au-filter">${searchIcon}<input type="text" class="fm-input" data-col="${col}"
                placeholder="Search, e.g. ${example}" title="Separate with &amp; to show several, e.g. ${example}"
                aria-label="Filter by ${label}" autocomplete="off"></label></td>`;

        const modalHTML = `
            <div id="accountUsersModal" class="fm-overlay au-overlay">
                <div class="fm-dialog au-dialog" role="dialog" aria-modal="true" aria-labelledby="accountModalTitle">
                    <div class="fm-dialog-head">
                        <div>
                            <h2 class="fm-dialog-title" id="accountModalTitle">Account users</h2>
                            <div class="au-sub" id="accountUsersHub"></div>
                        </div>
                        <button type="button" class="fm-dialog-close account-users-modal-close" aria-label="Close">&times;</button>
                    </div>
                    <div class="au-status">
                        <span id="accountUsersSummary" aria-live="polite"></span>
                        <button type="button" class="fm-btn fm-btn-text" id="accountUsersClearFilters" hidden>Clear filters</button>
                    </div>
                    <div class="au-loading" id="accountUsersLoadingMessage"><span class="fm-spinner fm-spinner-dark"></span><span id="accountUsersLoadingText">Loading users</span></div>
                    <div class="fm-alert fm-alert-error au-error" id="accountUsersErrorMessage" role="alert"></div>
                    <div class="au-table-wrap" id="accountUsersTableContainer" hidden>
                        <table class="au-table" id="accountUsersTable">
                            <colgroup><col style="width: 40%"><col style="width: 25%"><col style="width: 35%"></colgroup>
                            <thead>
                                <tr><th scope="col">Email</th><th scope="col">Default role</th><th scope="col">Company</th></tr>
                                <tr class="au-filter-row">
                                    ${filter(0, 'email', 'andrew &amp; bob')}
                                    ${filter(1, 'default role', 'architect &amp; engineer')}
                                    ${filter(2, 'company', 'granite &amp; pinnacle')}
                                </tr>
                            </thead>
                            <tbody id="accountUsersTableBody"></tbody>
                        </table>
                        <p class="au-empty" id="accountUsersNoMatch" hidden>No users match these filters. Change or clear them to see more.</p>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.setupModalEvents();
    }

    setupModalEvents() {
        const modal = document.getElementById('accountUsersModal');
        modal.querySelector('.account-users-modal-close').addEventListener('click', () => this.closeModal());

        // Close when clicking the dimmed background
        modal.addEventListener('click', (event) => {
            if (event.target === modal) this.closeModal();
        });

        // Esc clears the filter you're typing in first, then closes the dialog
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && modal.classList.contains('is-open')) this.closeModal();
        });

        this.getFilterInputs().forEach(input => {
            input.addEventListener('input', () => this.applyFilters());
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && input.value) {
                    event.stopPropagation();
                    input.value = '';
                    this.applyFilters();
                }
            });
        });
        document.getElementById('accountUsersClearFilters').addEventListener('click', () => {
            this.getFilterInputs().forEach(input => { input.value = ''; });
            this.applyFilters();
        });
    }

    getFilterInputs() {
        return Array.from(document.querySelectorAll('#accountUsersModal .au-filter input'));
    }

    /**
     * Show only rows matching every filter (case-insensitive). Within a filter,
     * "andrew & bob" shows either; the words of each part must all appear.
     */
    applyFilters() {
        const terms = this.getFilterInputs()
            .map(input => ({
                col: Number(input.dataset.col),
                groups: input.value.toLowerCase().split('&')
                    .map(part => part.trim().split(/\s+/).filter(Boolean))
                    .filter(words => words.length > 0)
            }))
            .filter(t => t.groups.length > 0);

        const rows = Array.from(document.getElementById('accountUsersTableBody').rows);
        let shown = 0;
        rows.forEach(row => {
            const match = terms.every(t => {
                const text = (row.cells[t.col]?.textContent || '').toLowerCase();
                return t.groups.some(words => words.every(w => text.includes(w)));
            });
            row.hidden = !match;
            if (match) shown++;
        });

        const users = n => `${n} ${n === 1 ? 'user' : 'users'}`;
        document.getElementById('accountUsersSummary').textContent =
            terms.length ? `Showing ${shown} of ${users(rows.length)}` : users(rows.length);
        document.getElementById('accountUsersClearFilters').hidden = terms.length === 0;
        document.getElementById('accountUsersNoMatch').hidden = !(terms.length && shown === 0);
    }

    async showAccountUsers(accountId, accountName) {
        const modal = document.getElementById('accountUsersModal');
        const loadingMessage = document.getElementById('accountUsersLoadingMessage');
        const tableContainer = document.getElementById('accountUsersTableContainer');
        const errorMessage = document.getElementById('accountUsersErrorMessage');

        document.getElementById('accountUsersHub').textContent = accountName || '';
        document.getElementById('accountUsersSummary').textContent = '';
        this.getFilterInputs().forEach(input => { input.value = ''; });

        // Show modal and loading state
        modal.classList.add('is-open');
        loadingMessage.hidden = false;
        tableContainer.hidden = true;
        errorMessage.classList.remove('is-visible');

        try {
            // Fetch all users with pagination
            const allUsers = await this.fetchAllAccountUsers(accountId);
            this.displayUsersTable(allUsers, accountName);
            loadingMessage.hidden = true;
            tableContainer.hidden = false;
            this.getFilterInputs()[0]?.focus();
        } catch (error) {
            console.error('Error fetching account users:', error);
            loadingMessage.hidden = true;
            errorMessage.textContent = `The account's users could not be loaded (${error.message}). Close this dialog and try again. If it keeps failing, check that the app is still added under Custom Integrations in Forma Account Admin.`;
            errorMessage.classList.add('is-visible');
        }
    }

    async fetchAllAccountUsers(accountId, providedToken = null) {
        // If a token is provided, use it; otherwise use the current token
        // This allows external callers to provide their own 2-legged token
        const tokenToUse = providedToken || this.currentAccessToken;

        let allUsers = [];
        let offset = 0;
        const limit = 100;
        let hasMoreData = true;

        while (hasMoreData) {
            const queryParams = new URLSearchParams({
                'limit': limit.toString(),
                'offset': offset.toString()
            });

            const apiUrl = `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/users?${queryParams}`;
            log(`Fetching account users: ${apiUrl}`);

            const response = await fetch(apiUrl, {
                headers: {
                    'Authorization': `Bearer ${tokenToUse}`,
                    'Content-Type': 'application/json'
                }
            });

            log(`API Response Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                let errorData;
                try {
                    errorData = await response.json();
                    log('Error response data:', errorData);
                    if (errorData.errors && Array.isArray(errorData.errors)) {
                        log('Detailed errors:', errorData.errors);
                        errorData.errors.forEach((error, index) => {
                            log(`Error ${index + 1}:`, error);
                        });
                    }
                } catch (parseError) {
                    const textError = await response.text();
                    log('Error response (text):', textError);
                    throw new Error(`API error ${response.status}: ${response.statusText} - ${textError}`);
                }

                const errorMessage = errorData.message ||
                                   errorData.error ||
                                   errorData.error_description ||
                                   errorData.detail ||
                                   (errorData.errors && errorData.errors[0] && errorData.errors[0].detail) ||
                                   `HTTP ${response.status}: ${response.statusText}`;
                throw new Error(errorMessage);
            }

            const usersData = await response.json();
            log(`Fetched ${usersData.length || 0} users at offset ${offset}`);

            if (usersData && Array.isArray(usersData) && usersData.length > 0) {
                allUsers = allUsers.concat(usersData);

                // Update loading message with progress (only visible while the dialog is loading)
                const loadingText = document.getElementById('accountUsersLoadingText');
                if (loadingText) loadingText.textContent = `Loading users: ${allUsers.length} so far`;

                // Check if we got fewer results than requested (indicates end of data)
                if (usersData.length < limit) {
                    hasMoreData = false;
                    log('Got fewer results than limit, assuming end of data');
                } else {
                    offset += limit;
                    log(`Next request will use offset: ${offset}`);
                }
            } else {
                hasMoreData = false;
                log('No results returned, stopping pagination');
            }

            // Safety check to prevent infinite loops
            if (offset > 10000) {
                console.warn('Stopping pagination at 10,000 users for safety');
                hasMoreData = false;
            }
        }

        return allUsers;
    }

    displayUsersTable(users, accountName) {
        const tableBody = document.getElementById('accountUsersTableBody');
        tableBody.replaceChildren();

        // Filter and sort users
        const validUsers = users
            .filter(user => user.email) // Filter out any null/undefined emails
            .sort((a, b) => a.email.localeCompare(b.email));

        // Values come from Autodesk: built with textContent, never as HTML.
        const cell = (value) => {
            const td = document.createElement('td');
            if (value) {
                td.textContent = value;
                td.title = value;
            } else {
                td.textContent = 'Not set';
                td.className = 'au-unset';
            }
            return td;
        };
        validUsers.forEach(user => {
            const row = document.createElement('tr');
            row.append(cell(user.email), cell(user.default_role || user.role), cell(user.company_name));
            tableBody.appendChild(row);
        });

        this.applyFilters();
    }

    // Method to fetch account users with 2-legged token (for use by other modules)
    async fetchAllAccountUsersWith2LeggedAuth(accountId) {
        try {
            // Use the global get2LeggedToken function from index.html
            const twoLeggedToken = await get2LeggedToken();
            return await this.fetchAllAccountUsers(accountId, twoLeggedToken);
        } catch (error) {
            console.error('Error fetching account users with 2-legged auth:', error);
            throw error;
        }
    }

    closeModal() {
        const modal = document.getElementById('accountUsersModal');
        modal.classList.remove('is-open');

        // Clear table content and reset the loading state
        document.getElementById('accountUsersTableBody').replaceChildren();
        document.getElementById('accountUsersLoadingText').textContent = 'Loading users';
        document.getElementById('accountUsersLoadingMessage').hidden = false;
        document.getElementById('accountUsersTableContainer').hidden = true;
        document.getElementById('accountUsersErrorMessage').classList.remove('is-visible');
    }
}

// Create global instance
const accountUsersManager = new AccountUsersManager();

// Global function to be called from main page
// Always uses 2-legged OAuth for account users
async function showAccountUsers(accountId, accountName, accessToken) {
    try {
        // Get 2-legged token for account users (HQ API requires 2-legged)
        // Use the global get2LeggedToken function from index.html
        const twoLeggedToken = await get2LeggedToken();
        accountUsersManager.setAccessToken(twoLeggedToken);
        accountUsersManager.showAccountUsers(accountId, accountName);
    } catch (error) {
        console.error('Error getting 2-legged token for account users:', error);
        alert(`Failed to authenticate: ${error.message}`);
    }
}
