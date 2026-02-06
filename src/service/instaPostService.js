import * as instaPostModel from '../model/instaPostModel.js';

export const findByClientId = async (clientId) => {
  return await instaPostModel.getPostsByClientId(clientId);
};

export const findTodayByClientId = async (clientId) => {
  return await instaPostModel.getPostsTodayByClient(clientId);
};

export const findByFilters = async (
  clientId,
  { periode, tanggal, startDate, endDate, role, scope, regionalId } = {}
) => {
  return await instaPostModel.getPostsByFilters(clientId, {
    periode,
    tanggal,
    startDate,
    endDate,
    role,
    scope,
    regionalId,
  });
};
