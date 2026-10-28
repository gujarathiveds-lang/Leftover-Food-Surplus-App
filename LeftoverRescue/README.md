# Leftover Rescue

A Node.js and Express surplus-food marketplace prototype with customer accounts, merchant accounts, food listings, reservations, cancellations, and inventory restoration.

## Requirements

- Node.js 18 or newer
- npm

## Run locally

Open a terminal in this project folder and run:

    npm install

Then start the server:

    npm start

Open this address in your browser:

    http://localhost:3000

Health check:

    http://localhost:3000/api/health

## Demo accounts

The included demo accounts use this password:

    rescue2026

Customer:
    customer@demo.local

Businesses:
    wawa@demo.local
    dunkin@demo.local
    panera@demo.local

## Add demo data

Run:

    npm run seed

The script adds missing demo accounts and listings without intentionally deleting existing reservations.

## Important notes

This is a local demonstration project. JSON files are suitable for a small demo, but a real public application should use a database and persistent session storage.

The default session secret is for local development only. Do not deploy this application publicly without configuring a strong SESSION_SECRET, HTTPS, persistent session storage, and appropriate production security.