# ACC User Management

A user permissions management tool for Autodesk Construction Cloud (ACC) projects.

## Description

This application provides functionality to manage user permissions and access levels within ACC projects. It includes features for retrieving account users, project users, and managing user permissions.

## Features

- Get account users from ACC
- Retrieve project-specific user lists
- User permissions management interface
- Web-based dashboard for user administration

## Prerequisites

- Node.js (v14 or higher)
- npm
- Autodesk Forge/APS credentials

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/ACC_User_Management.git
   cd ACC_User_Management
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Add your APS credentials:
     ```
     APS_CLIENT_ID=your_client_id_here
     APS_CLIENT_SECRET=your_client_secret_here
     ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. Open your browser and navigate to `http://localhost:8080/index.html`



## Project Structure

```
├── get_account_users.js    # Module for retrieving account users
├── get_project_users.js    # Module for retrieving project users
├── server.js               # Main server file
├── index.html              # Main dashboard page
├── users-table.html        # User management interface
├── user_permissions_import.json  # User permissions data
├── package.json            # Project dependencies
└── README.md               # This file
```

## API Endpoints

- `/api/account-users` - Get all account users
- `/api/project-users` - Get project-specific users

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Commit your changes (`git commit -am 'Add new feature'`)
4. Push to the branch (`git push origin feature/new-feature`)
5. Create a Pull Request

## Security Notes

- Never commit your `.env` file containing API credentials
- Ensure your APS credentials have appropriate permissions
- Regularly rotate your API keys

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions, please open an issue in the GitHub repository.
