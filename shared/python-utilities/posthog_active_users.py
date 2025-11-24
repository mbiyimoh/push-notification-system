#!/usr/bin/env python3
"""
PostHog Active Users Query Script

Pulls active unique users for multiple time periods:
- Last 24 hours
- Last 72 hours  
- Last 7 days
- Last 30 days

Uses all events to determine active users in each period.
Follows Standard #6 for cross-process Python execution.
"""

# --- BEGIN DEBUG SHIM ---
import os, sys, json, time, traceback
_ts = str(int(time.time()*1000))
_log_dir = os.path.join(os.getcwd(), "tmp")
os.makedirs(_log_dir, exist_ok=True)
_log_path = os.path.join(_log_dir, f"_pydebug_{_ts}.log")
try:
    with open(_log_path, "w", buffering=1) as f:
        f.write("[start]\n")
        f.write("argv=" + json.dumps(sys.argv) + "\n")
        f.write("executable=" + sys.executable + "\n")
        f.write("version=" + sys.version + "\n")
        f.write("cwd=" + os.getcwd() + "\n")
        keys = ["PATH","PYTHONPATH","VIRTUAL_ENV","OUTPUT_PATH","EXECUTION_ID","ENV","NODE_ENV"]
        env_dump = {k: os.environ.get(k) for k in keys}
        f.write("env_subset=" + json.dumps(env_dump) + "\n")
except Exception:
    pass
# --- END DEBUG SHIM ---

# Explicit path resolution
import sys, os
repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if repo_root not in sys.path:
    sys.path.insert(0, repo_root)

# Import with exception handling
try:
    from basic_capabilities.internal_db_queries_toolbox.config import get_secret
    import requests
    from datetime import datetime, timedelta
except Exception as e:
    with open(_log_path, "a", buffering=1) as f:
        f.write("[import_exception]\n")
        f.write(traceback.format_exc() + "\n")
    raise

def get_posthog_project_id():
    """
    Extract project ID from PostHog API key.
    PostHog API keys typically contain the project ID.
    """
    api_key = get_secret("POSTHOG_API_KEY")
    if not api_key:
        raise ValueError("POSTHOG_API_KEY not found in environment variables")
    
    # PostHog API keys format: phc_<project_data>_<project_id>
    # For now, we'll use a default project ID or extract from key
    # You may need to adjust this based on your actual PostHog setup
    return "your_project_id"  # Replace with actual project ID

def execute_hogql_query(query, project_id=None):
    """
    Execute a HogQL query against PostHog API.
    
    Args:
        query (str): The HogQL query to execute
        project_id (str): PostHog project ID (optional, will detect if not provided)
        
    Returns:
        dict: Query results from PostHog API
    """
    api_key = get_secret("POSTHOG_API_KEY")
    api_url = get_secret("POSTHOG_API_URL") or "https://app.posthog.com"
    
    if not api_key:
        raise ValueError("POSTHOG_API_KEY not found in environment variables")
    
    if not project_id:
        project_id = get_posthog_project_id()
    
    # PostHog API endpoint for HogQL queries
    endpoint = f"{api_url}/api/projects/{project_id}/query"
    
    # Payload structure as specified in the rules
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
        with open(_log_path, "a", buffering=1) as f:
            f.write(f"[api_error] {str(e)}\n")
            if hasattr(e.response, 'text'):
                f.write(f"[api_response] {e.response.text}\n")
        raise

def get_active_users_query(hours_back):
    """
    Generate HogQL query for active users in the specified time period.
    
    Args:
        hours_back (int): Number of hours to look back from now
        
    Returns:
        str: HogQL query string
    """
    # Calculate the start time (hours back from now)
    start_time = datetime.utcnow() - timedelta(hours=hours_back)
    start_time_str = start_time.strftime('%Y-%m-%d %H:%M:%S')
    
    # HogQL query following the syntax rules from the agent documentation
    query = f"""
    SELECT 
        COUNT(DISTINCT person_id) as active_users
    FROM events 
    WHERE 
        timestamp >= toDateTime('{start_time_str}')
        AND timestamp <= now()
    """
    
    return query

def main():
    """
    Main function to query active users for all time periods.
    """
    print("🚀 Querying PostHog for Active Users...")
    print(f"📊 Debug log: {_log_path}")
    
    # Define time periods (in hours)
    time_periods = {
        "24 hours": 24,
        "72 hours": 72, 
        "7 days": 7 * 24,
        "30 days": 30 * 24
    }
    
    results = {}
    
    try:
        # Note: You'll need to set the correct project_id for your PostHog instance
        # This can be found in your PostHog URL or project settings
        project_id = "your_project_id"  # Replace with actual project ID
        
        for period_name, hours in time_periods.items():
            print(f"\n📈 Querying active users for last {period_name}...")
            
            query = get_active_users_query(hours)
            print(f"🔍 Query: {query.strip()}")
            
            try:
                result = execute_hogql_query(query, project_id)
                
                # Extract the count from the result
                if 'results' in result and len(result['results']) > 0:
                    active_users = result['results'][0][0] if result['results'][0] else 0
                    results[period_name] = active_users
                    print(f"✅ Active users (last {period_name}): {active_users:,}")
                else:
                    results[period_name] = 0
                    print(f"⚠️  No data returned for last {period_name}")
                    
            except Exception as e:
                print(f"❌ Error querying {period_name}: {str(e)}")
                results[period_name] = "Error"
        
        # Summary output
        print("\n" + "="*50)
        print("📊 ACTIVE USERS SUMMARY")
        print("="*50)
        for period, count in results.items():
            if count != "Error":
                print(f"Last {period:.<20} {count:>10,}")
            else:
                print(f"Last {period:.<20} {'ERROR':>10}")
        print("="*50)
        
        # Save results to JSON for potential further processing
        output_file = os.path.join(_log_dir, f"active_users_report_{_ts}.json")
        with open(output_file, "w") as f:
            json.dump({
                "timestamp": datetime.utcnow().isoformat(),
                "results": results,
                "queries_executed": len(time_periods)
            }, f, indent=2)
        
        print(f"💾 Results saved to: {output_file}")
        
    except Exception as e:
        with open(_log_path, "a", buffering=1) as f:
            f.write("[main_exception]\n")
            f.write(traceback.format_exc() + "\n")
        print(f"❌ Fatal error: {str(e)}")
        print(f"🔍 Check debug log: {_log_path}")
        return 1
    
    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
