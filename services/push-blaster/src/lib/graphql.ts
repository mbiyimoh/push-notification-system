const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT!;
const GRAPHQL_API_KEY = process.env.GRAPHQL_API_KEY!;

const GQL_QUERY = `
  query GetDeviceTokens($userIds: [uuid!]) {
    users(where: {id: {_in: $userIds}}) {
      id
      devices(order_by: {updated_at: desc}, limit: 1, where: {token: {_is_null: false}}) {
        token
      }
    }
  }
`;

interface GraphQLResponse {
  data?: {
    users: {
      id: string;
      devices: {
        token: string;
      }[];
    }[];
  };
  errors?: { message: string }[];
}

const BATCH_SIZE = 100; // Set batch size to 100

export async function fetchDeviceTokens(userIds: string[]): Promise<{ id: string, token: string }[]> {
  console.log('fetchDeviceTokens called with userIds:', userIds.length);

  try {
    const batches: string[][] = [];
    for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
      batches.push(userIds.slice(i, i + BATCH_SIZE));
    }

    const allTokens: { id: string, token: string }[] = [];
    
    for (const batch of batches) {
      console.log(`Processing batch of ${batch.length} user IDs...`);
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hasura-admin-secret': GRAPHQL_API_KEY,
        },
        body: JSON.stringify({
          query: GQL_QUERY,
          variables: { userIds: batch },
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`GraphQL request failed for batch with status: ${response.status}, body: ${errorBody}`);
        // Continue to next batch instead of throwing
        continue;
      }

      const json: GraphQLResponse = await response.json();

      if (json.errors) {
        console.error('GraphQL returned errors for batch:', json.errors);
        // Continue to next batch
        continue;
      }

      if (json.data && json.data.users) {
        const tokensFromBatch = json.data.users.flatMap(user =>
          user.devices.length > 0 ? [{ id: user.id, token: user.devices[0].token }] : []
        );
        allTokens.push(...tokensFromBatch);
      }
    }
    
    return allTokens;
  } catch (error) {
    console.error('An unexpected error occurred in fetchDeviceTokens:', error);
    throw new Error('Failed to fetch device tokens');
  }
}

const GET_USER_IDS_FROM_TOKENS_QUERY = `
  query GetUserIdsFromTokens($tokens: [String!]) {
    devices(where: {token: {_in: $tokens}}) {
      user_id
    }
  }
`;

export async function fetchUserIdsFromTokens(tokens: string[]): Promise<string[]> {
  console.log(`fetchUserIdsFromTokens called with ${tokens.length} tokens.`);
  if (tokens.length === 0) {
    return [];
  }

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': GRAPHQL_API_KEY,
      },
      body: JSON.stringify({
        query: GET_USER_IDS_FROM_TOKENS_QUERY,
        variables: { tokens },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GraphQL request failed with status ${response.status}: ${errorBody}`);
    }

    const json: { data?: { devices: { user_id: string }[] } } = await response.json();

    if (json.data && json.data.devices) {
      return json.data.devices.map(d => d.user_id);
    }

    return [];
  } catch (error) {
    console.error('Error fetching user IDs from tokens:', error);
    return [];
  }
} 