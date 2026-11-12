const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createCaregiverRouter } = require('../caregivers/router');
const { createBookingRouter } = require('../bookings/router');
const { validateReview, parseReviewPage } = require('./validation');

const profileId = '11111111-1111-4111-8111-111111111111';
async function setup(t) {
  const state = { calls: [], error: null, created: true, offline: false };
  const page = { summary: { rating: 4.5, review_count: 2, distribution: {1:0,2:0,3:0,4:1,5:1} },
    reviews: [{ id:'9',rating:5,comment:'Buen cuidado',author_name:'Ana',service_name:'Paseos',created_at:null }], has_more:true,next_cursor:'9' };
  const db = { rpc: async (name, params) => {
    state.calls.push({ name, params });
    if (state.offline) throw new Error('Internal connection failure');
    return { error:state.error,data:name === 'pawhub_caregiver_reviews' ? page : { created:state.created,review:{id:'10',rating:params.p_rating,comment:params.p_comment} } };
  } };
  const auth = (req,res,next) => {
    if (!req.get('X-Owner')) return res.status(401).json({error:'Inicia sesión.'});
    req.account={id:101,roles:['owner']}; next();
  };
  const app=express();app.use(express.json());app.use('/caregivers',createCaregiverRouter(db,auth));app.use('/bookings',createBookingRouter(db,auth));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);}));
  const request=(url,body,authenticated=true)=>fetch(`http://127.0.0.1:${server.address().port}${url}`,{
    method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authenticated?{'X-Owner':'yes'}:{})},...(body?{body:JSON.stringify(body)}:{}) });
  return {state,request,page};
}

test('opiniones HTTP: consulta pública paginada con resumen, sin requerir sesión',async(t)=>{
  const {state,request,page}=await setup(t);
  const response=await request(`/caregivers/${profileId}/reviews?before_id=9223372036854775807&limit=2`,null,false);
  assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await response.json(),page);
  assert.deepEqual(state.calls[0],{name:'pawhub_caregiver_reviews',params:{p_profile_id:profileId,p_before_id:'9223372036854775807',p_limit:2}});
  assert.equal((await request('/caregivers/invalid/reviews',null,false)).status,404);
  for (const query of ['limit=0','limit=51','limit=abc','before_id=-1','before_id=9223372036854775808','limit=1&limit=2']) {
    assert.equal((await request(`/caregivers/${profileId}/reviews?${query}`,null,false)).status,400);
  }
  assert.equal(state.calls.length,1);
});

test('opiniones HTTP: publicación obtiene la identidad de la sesión y descarta campos manipulados',async(t)=>{
  const {state,request}=await setup(t);
  const body={rating:5,comment:' Buen cuidado ',owner_id:999,author_id:999,booking_id:77,caregiver_profile_id:'otro',status:'completed'};
  assert.equal((await request('/bookings/1/rating',body,false)).status,401);
  const response=await request('/bookings/1/rating',body);
  assert.equal(response.status,201);
  assert.deepEqual(state.calls[0],{name:'pawhub_publish_review',params:{p_owner_id:101,p_booking_id:'1',p_rating:5,p_comment:'Buen cuidado'}});
  state.created=false;assert.equal((await request('/bookings/1/rating',body)).status,200);
  assert.equal((await request('/bookings/invalid/rating',body)).status,400);
  assert.equal((await request('/bookings/1/rating',{rating:'5'})).status,400);
});

test('opiniones HTTP: informa restricciones y errores sin revelar detalles internos',async(t)=>{
  const {state,request}=await setup(t);
  for (const [code,status] of [['P0002',404],['42501',403],['P0001',409],['23505',409],['22023',400]]) {
    state.error={code,message:'No se puede valorar este servicio.'};
    assert.equal((await request('/bookings/1/rating',{rating:5})).status,status);
  }
  state.error={code:'PGRST202',message:'Internal database details'};
  const response=await request(`/caregivers/${profileId}/reviews`,null,false);
  assert.equal(response.status,503);assert.equal(JSON.stringify(await response.json()).includes('Internal database'),false);
  state.offline = true;
  for (const [path, body] of [[`/caregivers/${profileId}/reviews`, null], ['/bookings/1/rating', {rating:5}]]) {
    const failed = await request(path, body);
    assert.equal(failed.status,503); assert.match((await failed.json()).error, /Reintenta/);
  }
});

test('opiniones: valida estrellas enteras, comentarios y cursores sin aceptar identidad enviada',()=>{
  for (const body of [null,[],{}, {rating:0},{rating:6},{rating:4.5},{rating:'5'},{rating:5,comment:[]},{rating:5,comment:'a'.repeat(2001)}]) assert.ok(Object.keys(validateReview(body).errors).length);
  assert.deepEqual(validateReview({rating:4,comment:'  ',author_id:99}).data,{rating:4,comment:null});
  assert.deepEqual(parseReviewPage({}).data,{p_before_id:null,p_limit:5});
});
