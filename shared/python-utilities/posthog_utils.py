"""
PostHog API Utilities.

This script provides helper functions to interact with the PostHog API
using the credentials loaded from the config. Follows PostHog agent rules
for proper HogQL syntax and API usage.
"""
import requests
from datetime import datetime, timedelta
from basic_capabilities.internal_db_queries_toolbox.config import get_secret

def get_posthog_config():
    """
    Get PostHog API configuration from environment variables.
    
    Returns:
        tuple: (api_key, api_url, project_id)
    """
    api_key = get_secret("POSTHOG_API_KEY")
    api_url = get_secret("POSTHOG_API_URL") or "https://app.posthog.com"
    project_id = get_secret("POSTHOG_PROJECT_ID")
    
    if not api_key:
        raise ValueError("POSTHOG_API_KEY not found in environment variables")
    
    if not project_id:
        # You'll need to set POSTHOG_PROJECT_ID in your .env file
        raise ValueError("POSTHOG_PROJECT_ID not found in environment variables")
    
    return api_key, api_url, project_id

def execute_hogql_query(query, project_id=None):
    """
    Execute a HogQL query against PostHog API.
    
    Args:
        query (str): The HogQL query to execute
        project_id (str): PostHog project ID (optional, will use config if not provided)
        
    Returns:
        dict: Query results from PostHog API
    """
    api_key, api_url, default_project_id = get_posthog_config()
    
    # Use provided project_id or fall back to config
    project_id = project_id or default_project_id
    
    # PostHog API endpoint for HogQL queries
    endpoint = f"{api_url}/api/projects/{project_id}/query"
    
    # Payload structure as specified in the PostHog agent rules
    payload = {
        "query": {
            "kind": "HogQLQuery",
            "query": query
        }
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"PostHog API Error: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        raise

def query_events(user_ids, start_date, end_date, event_names=None, limit=1000):
    """
    Pull raw event data for a set of users over a date range.
    
    Args:
        user_ids (list): List of user ID strings
        start_date (str): Start date in ISO format (UTC)
        end_date (str): End date in ISO format (UTC)
        event_names (list, optional): List of event name strings to filter
        limit (int): Maximum number of results to return
        
    Returns:
        list: Raw PostHog events for the given users
    """
    # Convert user_ids list to SQL array format
    user_ids_sql = "(" + ",".join([f"'{uid}'" for uid in user_ids]) + ")"
    
    # Build the base query
    query = f"""
    SELECT 
        person_id,
        event,
        timestamp,
        properties
    FROM events 
    WHERE 
        person_id IN {user_ids_sql}
        AND timestamp >= toDateTime('{start_date}')
        AND timestamp <= toDateTime('{end_date}')
    """
    
    # Add event name filter if specified
    if event_names:
        event_names_sql = "(" + ",".join([f"'{name}'" for name in event_names]) + ")"
        query += f" AND event IN {event_names_sql}"
    
    # Add ordering and limit
    query += f" ORDER BY timestamp DESC LIMIT {limit}"
    
    result = execute_hogql_query(query)
    return result.get('results', [])

def create_static_cohort(cohort_name, user_ids):
    """
    Create a static cohort inside PostHog from a user ID list.
    
    Args:
        cohort_name (str): Name for the cohort (include date/context for traceability)
        user_ids (list): List of user ID strings
        
    Returns:
        dict: Cohort creation response with cohort ID
    """
    api_key, api_url, project_id = get_posthog_config()
    
    endpoint = f"{api_url}/api/projects/{project_id}/cohorts/"
    
    payload = {
        "name": cohort_name,
        "is_static": True,
        "csv": "\n".join(user_ids)  # PostHog expects CSV format for static cohorts
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(endpoint, json=payload, headers=headers)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"PostHog Cohort Creation Error: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response: {e.response.text}")
        raise

def get_active_users_count(hours_back):
    """
    Get count of unique active users in the specified time period.
    Uses PostHog's prescribed approach with distinct_id and INTERVAL syntax.
    
    Args:
        hours_back (int): Number of hours to look back from now
        
    Returns:
        int: Count of unique active users
    """
    # Convert hours to days for INTERVAL syntax
    if hours_back == 24:
        interval = "1 DAY"
    elif hours_back == 72:
        interval = "3 DAY" 
    elif hours_back == 168:  # 7 days
        interval = "7 DAY"
    elif hours_back == 720:  # 30 days
        interval = "30 DAY"
    else:
        # For any other value, calculate days
        days = hours_back / 24
        interval = f"{days} DAY"
    
    # PostHog's prescribed HogQL query approach
    query = f"""
    SELECT count(DISTINCT person_id) AS unique_users 
    FROM events 
    WHERE timestamp >= now() - INTERVAL {interval}
    """
    
    result = execute_hogql_query(query)
    
    # Extract the count from the result
    if result.get('results') and len(result['results']) > 0 and result['results'][0]:
        return result['results'][0][0]
    return 0

def get_event_count(event_name, hours_back):
    """
    Get count of specific events in the specified time period.
    Uses PostHog's prescribed approach with INTERVAL syntax.
    
    Args:
        event_name (str): Name of the event to count (e.g., "Offer Created")
        hours_back (int): Number of hours to look back from now
        
    Returns:
        int: Count of events
    """
    # Convert hours to days for INTERVAL syntax
    if hours_back == 24:
        interval = "1 DAY"
    elif hours_back == 72:
        interval = "3 DAY" 
    elif hours_back == 168:  # 7 days
        interval = "7 DAY"
    elif hours_back == 720:  # 30 days
        interval = "30 DAY"
    else:
        # For any other value, calculate days
        days = hours_back / 24
        interval = f"{days} DAY"
    
    # PostHog's prescribed HogQL query approach
    query = f"""
    SELECT count(*) 
    FROM events 
    WHERE event = '{event_name}' AND timestamp >= now() - INTERVAL {interval}
    """
    
    result = execute_hogql_query(query)
    
    # Extract the count from the result
    if result.get('results') and len(result['results']) > 0 and result['results'][0]:
        return result['results'][0][0]
    return 0

def get_unique_event_creators(event_name, hours_back):
    """
    Get count of unique users who performed a specific event in the time period.
    Uses PostHog's prescribed approach with distinct_id and INTERVAL syntax.
    
    Args:
        event_name (str): Name of the event to count creators for (e.g., "Offer Created")
        hours_back (int): Number of hours to look back from now
        
    Returns:
        int: Count of unique users who performed the event
    """
    # Convert hours to days for INTERVAL syntax
    if hours_back == 24:
        interval = "1 DAY"
    elif hours_back == 72:
        interval = "3 DAY" 
    elif hours_back == 168:  # 7 days
        interval = "7 DAY"
    elif hours_back == 720:  # 30 days
        interval = "30 DAY"
    else:
        # For any other value, calculate days
        days = hours_back / 24
        interval = f"{days} DAY"
    
    # PostHog's prescribed HogQL query approach
    query = f"""
    SELECT count(DISTINCT person_id) AS unique_creators
    FROM events 
    WHERE event = '{event_name}' AND timestamp >= now() - INTERVAL {interval}
    """
    
    result = execute_hogql_query(query)
    
    # Extract the count from the result
    if result.get('results') and len(result['results']) > 0 and result['results'][0]:
        return result['results'][0][0]
    return 0

def get_daily_active_users(start_date, end_date):
    """
    Get daily active users count for a date range.
    
    Args:
        start_date (str): Start date in YYYY-MM-DD format
        end_date (str): End date in YYYY-MM-DD format
        
    Returns:
        list: List of dicts with {date, active_users}
    """
    # PostHog HogQL query for daily active users aggregation
    query = f"""
    SELECT 
        toDate(timestamp) as date,
        uniq(distinct_id) as active_users
    FROM events 
    WHERE timestamp >= '{start_date}' AND timestamp <= '{end_date}' 
    GROUP BY date 
    ORDER BY date ASC
    """
    
    result = execute_hogql_query(query)
    
    # Convert result to expected format
    daily_data = []
    if result.get('results'):
        for row in result['results']:
            if row and len(row) >= 2:
                daily_data.append({
                    'date': row[0],  # Date from PostHog
                    'active_users': row[1]  # Count of unique active users
                })
    
    return daily_data

def get_daily_unique_offer_creators(start_date, end_date):
    """
    Get daily unique offer creators count for a date range.
    
    Args:
        start_date (str): Start date in YYYY-MM-DD format
        end_date (str): End date in YYYY-MM-DD format
        
    Returns:
        list: List of dicts with {date, unique_creators}
    """
    # PostHog HogQL query for daily unique offer creators
    query = f"""
    SELECT 
        toDate(timestamp) as date,
        uniq(distinct_id) as unique_creators
    FROM events 
    WHERE event = 'Offer Created' 
        AND timestamp >= '{start_date}' 
        AND timestamp <= '{end_date}' 
    GROUP BY date 
    ORDER BY date ASC
    """
    
    result = execute_hogql_query(query)
    
    # Convert result to expected format
    daily_data = []
    if result.get('results'):
        for row in result['results']:
            if row and len(row) >= 2:
                daily_data.append({
                    'date': row[0],  # Date from PostHog
                    'unique_creators': row[1]  # Count of unique offer creators
                })
    
    return daily_data

# Example usage:
if __name__ == '__main__':
    print("Testing PostHog connection...")
    try:
        # Test with a simple active users query for last 24 hours
        count = get_active_users_count(24)
        print(f"Active users in last 24 hours: {count:,}")
    except Exception as e:
        print(f"Error: {str(e)}")
        print("Make sure POSTHOG_API_KEY and POSTHOG_PROJECT_ID are set in your .env file")
