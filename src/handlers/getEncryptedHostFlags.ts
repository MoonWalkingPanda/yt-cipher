import {
    createApiError,
    formatLogMessage,
    measureTimeAsync,
    validateRequiredFields
} from "../utils.ts";
import type { RequestContext, GetHostFlagsRequest } from "../types.ts";
import { recordError } from "../metrics.ts";

export async function handleGetEncryptedHostFlags(ctx: RequestContext): Promise<Response> {
    const { requestId, startTime } = ctx;
    const { video_id } = ctx.body as GetHostFlagsRequest;

    try {
        if (!video_id) {
            const error = createApiError(
                'video_id is required',
                'MISSING_REQUIRED_PARAMS',
                { received: Object.keys(ctx.body) },
                requestId
            );

            return new Response(JSON.stringify({
                success: false,
                error,
                timestamp: new Date().toISOString()
            }), {
                status: 400,
                headers: {
                    "Content-Type": "application/json",
                    "X-Request-ID": requestId
                }
            });
        }

        console.log(formatLogMessage('info', 'Fetching encrypted host flags', {
            requestId,
            videoId: video_id
        }));

        const embedUrl = `https://www.youtube.com/embed/${video_id}`;

        const { result: html, duration: fetchDuration } = await measureTimeAsync(async () => {
            const response = await fetch(embedUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch embed page: ${response.status}`);
            }

            return await response.text();
        });

        // Extract encryptedHostFlags using regex
        // Looking for: "encryptedHostFlags":"..." or similar in ytcfg.set or config
        const pattern = /"encryptedHostFlags"\s*:\s*"([^"]+)"/;
        const match = html.match(pattern);

        if (!match || !match[1]) {
            console.warn(formatLogMessage('warn', 'encryptedHostFlags not found in embed page', {
                requestId,
                videoId: video_id
            }));

            const error = createApiError(
                'encryptedHostFlags not found',
                'FLAGS_NOT_FOUND',
                { videoId: video_id },
                requestId
            );

            return new Response(JSON.stringify({
                success: false,
                error,
                timestamp: new Date().toISOString()
            }), {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    "X-Request-ID": requestId
                }
            });
        }

        const encryptedHostFlags = match[1];
        const processingTime = Date.now() - startTime;

        console.log(formatLogMessage('info', 'Encrypted host flags fetched successfully', {
            requestId,
            fetchDuration: `${fetchDuration.toFixed(2)}ms`,
            processingTime
        }));

        return new Response(JSON.stringify({
            encrypted_host_flags: encryptedHostFlags,
            success: true,
            timestamp: new Date().toISOString(),
            processing_time_ms: processingTime
        }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "X-Request-ID": requestId
            }
        });

    } catch (error) {
        console.error(formatLogMessage('error', 'Get encrypted host flags handler failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        }));

        const apiError = createApiError(
            'Failed to fetch encrypted host flags',
            'FETCH_ERROR',
            { originalError: error instanceof Error ? error.message : 'Unknown error' },
            requestId
        );

        return new Response(JSON.stringify({
            success: false,
            error: apiError,
            timestamp: new Date().toISOString()
        }), {
            status: 500,
            headers: {
                "Content-Type": "application/json",
                "X-Request-ID": requestId
            }
        });
    }
}
