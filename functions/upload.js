import { errorHandling, telemetryData } from "./utils/middleware";

export async function onRequestPost(context) {
    const { request, env } = context;

    try {
        const clonedRequest = request.clone();
        const formData = await clonedRequest.formData();

        await errorHandling(context);
        telemetryData(context);

        // 获取所有上传的文件
        const uploadFiles = formData.getAll('file');
        if (!uploadFiles || uploadFiles.length === 0) {
            throw new Error('No files uploaded');
        }

        // 限制单次上传文件数量（可根据需要调整）
        const MAX_FILES = 10;
        if (uploadFiles.length > MAX_FILES) {
            throw new Error(`Too many files. Maximum ${MAX_FILES} files allowed.`);
        }

        const results = [];
        const errors = [];

        // 并发上传所有文件
        const uploadPromises = uploadFiles.map(async (uploadFile, index) => {
            try {
                if (!uploadFile || !uploadFile.name) {
                    throw new Error(`Invalid file at index ${index}`);
                }

                const fileName = uploadFile.name;
                const fileExtension = fileName.split('.').pop().toLowerCase();

                const telegramFormData = new FormData();
                telegramFormData.append("chat_id", env.TG_Chat_ID);

                // 根据文件类型选择合适的上传方式
                let apiEndpoint;
                if (uploadFile.type.startsWith('image/')) {
                    telegramFormData.append("photo", uploadFile);
                    apiEndpoint = 'sendPhoto';
                } else if (uploadFile.type.startsWith('audio/')) {
                    telegramFormData.append("audio", uploadFile);
                    apiEndpoint = 'sendAudio';
                } else if (uploadFile.type.startsWith('video/')) {
                    telegramFormData.append("video", uploadFile);
                    apiEndpoint = 'sendVideo';
                } else {
                    telegramFormData.append("document", uploadFile);
                    apiEndpoint = 'sendDocument';
                }

                const result = await sendToTelegram(telegramFormData, apiEndpoint, env);

                if (!result.success) {
                    throw new Error(result.error);
                }

                const fileId = getFileId(result.data);

                if (!fileId) {
                    throw new Error('Failed to get file ID');
                }

                // 将文件信息保存到 KV 存储
                if (env.img_url) {
                    await env.img_url.put(`${fileId}.${fileExtension}`, "", {
                        metadata: {
                            TimeStamp: Date.now(),
                            ListType: "None",
                            Label: "None",
                            liked: false,
                            fileName: fileName,
                            fileSize: uploadFile.size,
                        }
                    });
                }

                return {
                    success: true,
                    src: `/file/${fileId}.${fileExtension}`,
                    fileName: fileName,
                    fileSize: uploadFile.size
                };
            } catch (error) {
                console.error(`Upload error for file ${index}:`, error);
                return {
                    success: false,
                    error: error.message,
                    fileName: uploadFile?.name || `file_${index}`
                };
            }
        });

        // 等待所有上传完成
        const uploadResults = await Promise.all(uploadPromises);

        // 分离成功和失败的结果
        uploadResults.forEach(result => {
            if (result.success) {
                results.push({
                    src: result.src,
                    fileName: result.fileName,
                    fileSize: result.fileSize
                });
            } else {
                errors.push({
                    fileName: result.fileName,
                    error: result.error
                });
            }
        });

        // 返回结果
        const response = {
            success: results.length > 0,
            uploaded: results.length,
            total: uploadFiles.length,
            results: results
        };

        if (errors.length > 0) {
            response.errors = errors;
        }

        return new Response(
            JSON.stringify(response),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (error) {
        console.error('Upload error:', error);
        return new Response(
            JSON.stringify({ 
                success: false,
                error: error.message 
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

function getFileId(response) {
    if (!response.ok || !response.result) return null;

    const result = response.result;
    if (result.photo) {
        return result.photo.reduce((prev, current) =>
            (prev.file_size > current.file_size) ? prev : current
        ).file_id;
    }
    if (result.document) return result.document.file_id;
    if (result.video) return result.video.file_id;
    if (result.audio) return result.audio.file_id;

    return null;
}

async function sendToTelegram(formData, apiEndpoint, env, retryCount = 0) {
    const MAX_RETRIES = 2;
    const apiUrl = `https://api.telegram.org/bot${env.TG_Bot_Token}/${apiEndpoint}`;

    try {
        const response = await fetch(apiUrl, { method: "POST", body: formData });
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData };
        }

        // 图片上传失败时转为文档方式重试
        if (retryCount < MAX_RETRIES && apiEndpoint === 'sendPhoto') {
            console.log('Retrying image as document...');
            const newFormData = new FormData();
            newFormData.append('chat_id', formData.get('chat_id'));
            newFormData.append('document', formData.get('photo'));
            return await sendToTelegram(newFormData, 'sendDocument', env, retryCount + 1);
        }

        return {
            success: false,
            error: responseData.description || 'Upload to Telegram failed'
        };
    } catch (error) {
        console.error('Network error:', error);
        if (retryCount < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await sendToTelegram(formData, apiEndpoint, env, retryCount + 1);
        }
        return { success: false, error: 'Network error occurred' };
    }
}