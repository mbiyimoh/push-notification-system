"""
PostgreSQL Database Utilities.

This script provides helper functions to connect to the PostgreSQL database
and execute SQL queries using the credentials loaded from the config.
"""
import sys
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from basic_capabilities.internal_db_queries_toolbox import config

# Connection timeout in seconds - increased for Railway -> AWS RDS latency
# Python scripts run complex queries that can take time to establish connections
DB_CONNECT_TIMEOUT = 120

# Retry settings for connection resilience
MAX_RETRIES = 3
RETRY_DELAY_BASE = 5  # Base delay in seconds, exponentially increases

def get_db_connection(retry_count=0):
    """
    Establishes a connection to the PostgreSQL database.

    Uses the DATABASE_URL from the config with a connection timeout.

    Returns:
        A psycopg2 connection object, or None if the connection fails.
    """
    try:
        db_url = config.DATABASE_URL

        # Debug: Log connection attempt (masked for security)
        if db_url:
            # Mask the password and sensitive parts of the URL
            safe_url = db_url.split('@')[-1] if '@' in db_url else 'URL set but format unclear'
            print(f"[sql_utils] Attempting DB connection to: ...@{safe_url}", flush=True)
            print(f"[sql_utils] Connect timeout: {DB_CONNECT_TIMEOUT}s", flush=True)
        else:
            print("[sql_utils] ERROR: DATABASE_URL is not set!", flush=True)
            return None

        # Add connection timeout to prevent indefinite hangs
        # Add sslmode=require to match Node.js pg behavior with AWS RDS
        # Check if sslmode is already in the URL
        if 'sslmode=' not in db_url:
            separator = '&' if '?' in db_url else '?'
            db_url = f"{db_url}{separator}sslmode=require"
            print(f"[sql_utils] Added sslmode=require to connection string", flush=True)

        conn = psycopg2.connect(db_url, connect_timeout=DB_CONNECT_TIMEOUT)
        print("[sql_utils] Database connection established successfully", flush=True)
        return conn
    except psycopg2.OperationalError as e:
        print(f"[sql_utils] ERROR: Could not connect to the database: {e}", flush=True)
        sys.stdout.flush()

        # Retry with exponential backoff
        if retry_count < MAX_RETRIES:
            delay = RETRY_DELAY_BASE * (2 ** retry_count)
            print(f"[sql_utils] Retrying connection in {delay}s (attempt {retry_count + 1}/{MAX_RETRIES})...", flush=True)
            time.sleep(delay)
            return get_db_connection(retry_count + 1)

        print(f"[sql_utils] All {MAX_RETRIES} connection attempts failed", flush=True)
        return None
    except Exception as e:
        print(f"[sql_utils] ERROR: Unexpected error connecting to database: {e}", flush=True)
        sys.stdout.flush()
        return None

def execute_query(query, params=None):
    """
    Executes a SQL query and fetches all results.

    This function handles the connection and cursor management.

    Args:
        query (str): The SQL query to execute.
        params (tuple, optional): The parameters to substitute in the query. Defaults to None.

    Returns:
        A list of dicts representing the rows returned by the query, or None if an error occurs.
    """
    conn = None
    try:
        conn = get_db_connection()
        if conn is None:
            return None
            
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(query, params)
            results = cur.fetchall()
            return results
    except Exception as e:
        print(f"Error executing query: {e}")
        return None
    finally:
        if conn:
            conn.close()

# Example Usage:
if __name__ == '__main__':
    print("Testing database connection...")
    # This is a simple query that should always work if the connection is valid.
    test_query = "SELECT version();"
    version = execute_query(test_query)
    
    if version:
        print("Successfully connected to PostgreSQL.")
        print("Database version:", version[0][0])
    else:
        print("Failed to connect or execute query.") 