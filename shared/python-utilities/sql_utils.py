"""
PostgreSQL Database Utilities.

This script provides helper functions to connect to the PostgreSQL database
and execute SQL queries using the credentials loaded from the config.
"""
import psycopg2
from psycopg2.extras import RealDictCursor
from basic_capabilities.internal_db_queries_toolbox import config

def get_db_connection():
    """
    Establishes a connection to the PostgreSQL database.

    Uses the DATABASE_URL from the config.

    Returns:
        A psycopg2 connection object, or None if the connection fails.
    """
    try:
        conn = psycopg2.connect(config.DATABASE_URL)
        return conn
    except psycopg2.OperationalError as e:
        print(f"Error: Could not connect to the database. {e}")
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