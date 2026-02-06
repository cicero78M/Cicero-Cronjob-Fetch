import * as instaPostKhususModel from '../model/instaPostKhususModel.js';

export const findByClientId = async (client_id) => {
  return await instaPostKhususModel.findByClientId(client_id);
};

export const findTodayByClientId = async (client_id) => {
  return await instaPostKhususModel.getPostsTodayByClient(client_id);
};

export const findByClientIdRange = async (
  client_id,
  { days, startDate, endDate } = {}
) => {
  return await instaPostKhususModel.getPostsByClientAndDateRange(client_id, {
    days,
    startDate,
    endDate,
  });
};
