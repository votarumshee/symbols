import test from 'node:test';
import assert from 'node:assert/strict';
import {wishesScreen} from '../src/wishes.mjs';

test('wishes escape user text, preserve drafts and expose accessible like state',()=>{
 const html=wishesScreen({draft:'</textarea><script>x</script>',wishes:[{id:'a',nick:'<img>',body:'<script>alert(1)</script> ♥',likes:5000,liked:true,created:'2026-11-04T00:00:00Z'}],nextOffset:30});
 assert.ok(html.includes('Пожелания людей'));assert.ok(html.includes('Больше всего лайков'));
 assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img>'));
 assert.ok(html.includes('aria-pressed="true"'));assert.ok(html.includes('5000'));assert.ok(html.includes('id="more-wishes"'));
});
