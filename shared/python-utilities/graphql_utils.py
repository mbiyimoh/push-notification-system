"""
GraphQL Client Utilities.

This script provides a helper function to execute queries against the
Hasura GraphQL endpoint using the credentials from the config.
"""
import requests
import config

def execute_graphql_query(query, variables=None):
    """
    Executes a GraphQL query.

    Args:
        query (str): The GraphQL query string.
        variables (dict, optional): A dictionary of variables for the query. Defaults to None.

    Returns:
        A dictionary with the JSON response from the server, or None if an error occurs.
    """
    if not config.GRAPHQL_ENDPOINT or not config.GRAPHQL_API_KEY:
        print("Error: GraphQL endpoint or API key is not configured.")
        return None

    headers = {
        "Content-Type": "application/json",
        "x-hasura-admin-secret": config.GRAPHQL_API_KEY
    }
    
    json_data = {"query": query}
    if variables:
        json_data["variables"] = variables
        
    try:
        response = requests.post(config.GRAPHQL_ENDPOINT, headers=headers, json=json_data)
        response.raise_for_status()  # Raises an HTTPError for bad responses (4xx or 5xx)
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error executing GraphQL query: {e}")
        # It's often useful to print the response body for debugging
        if e.response:
            print("Response body:", e.response.text)
        return None

def get_validated_offer_ids(offer_ids, start_date=None, end_date=None):
    """
    Filters a list of offer IDs, returning only those validated within a specific date range.
    Validation is defined by the existence of `validation_passed_date` on the related trade.
    If no dates are provided, it returns all offers that have a validation date.

    Args:
        offer_ids (list): A list of strings, where each string is an offer ID.
        start_date (str, optional): The start of the date range (YYYY-MM-DD).
        end_date (str, optional): The end of the date range (YYYY-MM-DD).

    Returns:
        A list of offer IDs that are considered validated within the given timeframe.
    """
    if not offer_ids:
        return []

    # The base 'where' condition ensures a validation date exists.
    where_conditions = [
        "{id: {_in: $offerIds}}",
        "{trades: {validation_passed_date: {_is_null: false}}}"
    ]

    # Dynamically add date range conditions if they are provided.
    if start_date:
        where_conditions.append("{trades: {validation_passed_date: {_gte: $startDate}}}")
    if end_date:
        where_conditions.append("{trades: {validation_passed_date: {_lte: $endDate}}}")
    
    # Combine all conditions with _and
    where_clause = f"_and: [{', '.join(where_conditions)}]"

    query = f"""
    query GetValidatedOffers($offerIds: [uuid!], $startDate: timestamptz, $endDate: timestamptz) {{
      offers(where: {{{where_clause}}}) {{
        id
      }}
    }}
    """
    
    variables = {"offerIds": offer_ids}
    if start_date:
        variables["startDate"] = start_date
    if end_date:
        variables["endDate"] = end_date
    
    result = execute_graphql_query(query, variables)
    
    if result and "data" in result and result["data"]["offers"]:
        validated_ids = [offer['id'] for offer in result['data']['offers']]
        return validated_ids
    elif result and "errors" in result:
        print("GraphQL query for validated offers returned errors:")
        for error in result['errors']:
            print(f"- {error.get('message')}") # More detailed error logging
        return []
    else:
        print("No validated offers found or error in query. Raw response:")
        print(result) # Print the full response for debugging
        return []

# Example Usage:
if __name__ == '__main__':
    print("Testing GraphQL endpoint...")
    # This is a simple introspection query to check the schema's query type.
    # It should work on any standard GraphQL endpoint.
    test_query = """
    query IntrospectionQuery {
      __schema {
        queryType {
          name
        }
      }
    }
    """
    result = execute_graphql_query(test_query)

    if result and "errors" not in result:
        print("Successfully connected to GraphQL endpoint.")
        print("Schema query type:", result['data']['__schema']['queryType']['name'])
    elif result and "errors" in result:
        print("Connected to GraphQL, but the query returned errors:")
        for error in result['errors']:
            print(error['message'])
    else:
        print("Failed to connect or execute GraphQL query.") 

    print("\nTesting get_validated_offer_ids...")
    # NOTE: These are dummy IDs. Replace with actual offer IDs from your DB for a real test.
    test_offer_ids = ["offer_123", "offer_456", "offer_789"] 
    validated_offers = get_validated_offer_ids(test_offer_ids)
    if validated_offers:
        print(f"Found validated offers: {validated_offers}")
    else:
        print("No validated offers found among the test IDs.") 