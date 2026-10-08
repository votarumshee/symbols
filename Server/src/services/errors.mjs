export class ApiError extends Error{constructor(status,code,message){super(message);this.statusCode=status;this.code=code;}}
export const conflict=(message='Данные изменились. Получи новый снимок.')=>new ApiError(409,'REVISION_CONFLICT',message);
export function requireValue(condition,message,status=400,code='INVALID_COMMAND'){if(!condition)throw new ApiError(status,code,message);}
