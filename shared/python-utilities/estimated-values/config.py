"""
Configuration loader using python-dotenv.

This script loads environment variables from a .env file in the project root.
It makes them available as Python variables for use in other scripts,
such as database connectors and API clients.

Make sure you have a .env file in the root directory with the necessary keys.
"""
import os
from dotenv import load_dotenv

# Load the .env file from the root of the project
load_dotenv()

# --- PostgreSQL Database Configuration ---
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_SSL_MODE = os.getenv("DB_SSL_MODE")
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Hasura GraphQL Configuration ---
GRAPHQL_ENDPOINT = os.getenv("GRAPHQL_ENDPOINT")
GRAPHQL_API_KEY = os.getenv("GRAPHQL_API_KEY")

# Stripe Configuration
STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")

# --- Figma API Access Token ---
FIGMA_ACCESS_TOKEN = os.getenv("FIGMA_ACCESS_TOKEN")

# --- PostHog API Secret Key ---
POSTHOG_API_KEY = os.getenv("POSTHOG_API_KEY")

# --- Mailjet API Keys ---
MAILJET_API_KEY = os.getenv("MAILJET_API_KEY")
MAILJET_API_SECRET = os.getenv("MAILJET_API_SECRET")

# You can add a simple check to ensure variables are loaded
if not all([DATABASE_URL, GRAPHQL_ENDPOINT, GRAPHQL_API_KEY]):
    print("Warning: Not all essential environment variables are loaded. Check your .env file.") 