import axios from 'axios';
import * as clientModel from '../model/clientModel.js';
import * as userModel from '../model/userModel.js';
import * as instaPostService from './instaPostService.js';
import * as instaLikeService from './instaLikeService.js';
import * as tiktokPostService from './tiktokPostService.js';
import * as tiktokCommentService from './tiktokCommentService.js';


const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

export const findAllClients = async () => await clientModel.findAll();

export const findAllActiveClients = async () => await clientModel.findAllActive();

export const findAllActiveDirektoratClients = async () =>
  await clientModel.findAllActiveDirektorat();

export const findAllClientsByType = async (clientType) =>
  await clientModel.findAllByType(clientType);

export const findClientById = async (client_id) => await clientModel.findById(client_id);

export const findClientsByGroup = async (group) => await clientModel.findByGroup(group);

export const createClient = async (data) => await clientModel.create(data);

export const updateClient = async (client_id, data) => await clientModel.update(client_id, data);

export const deleteClient = async (client_id) => await clientModel.remove(client_id);


export async function fetchTiktokSecUid(username) {
  if (!username) return null;
  try {
    const res = await axios.get(`https://${RAPIDAPI_HOST}/api/user/info`, {
      params: { uniqueId: username.replace(/^@/, "") },
      headers: {
        "x-rapidapi-key": RAPIDAPI_KEY,
        "x-rapidapi-host": RAPIDAPI_HOST,
      },
    });
    return res.data?.userInfo?.user?.secUid || null;
  } catch {
    return null;
  }
}

export async function getClientSummary(client_id) {
  const client = await clientModel.findById(client_id);
  if (!client) return null;

  const users = await userModel.findUsersByClientId(client_id);

  const instaPosts = await instaPostService.findByClientId(client_id);
  const instaLikesCounts = await Promise.all(
    instaPosts.map(async (post) => {
      const like = await instaLikeService.findByShortcode(post.shortcode);
      return Array.isArray(like?.likes) ? like.likes.length : 0;
    })
  );
  const instaLikes = instaLikesCounts.reduce((total, count) => total + count, 0);

  const tiktokPosts = await tiktokPostService.findByClientId(client_id);
  const tiktokCommentsCounts = await Promise.all(
    tiktokPosts.map(async (post) => {
      const comm = await tiktokCommentService.findByVideoId(post.video_id);
      return Array.isArray(comm?.comments) ? comm.comments.length : 0;
    })
  );
  const tiktokComments = tiktokCommentsCounts.reduce(
    (total, count) => total + count,
    0
  );

  return {
    client,
    user_count: users.length,
    insta_post_count: instaPosts.length,
    tiktok_post_count: tiktokPosts.length,
    total_insta_likes: instaLikes,
    total_tiktok_comments: tiktokComments,
  };
}
