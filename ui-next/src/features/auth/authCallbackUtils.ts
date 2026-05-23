export const parseOAuthCallbackSearch = (search: string) => {
    const params = new URLSearchParams(search);
    return {
        code: params.get("code"),
        state: params.get("state"),
        error: params.get("error"),
    };
};
