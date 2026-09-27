import QRCode from 'qrcode'

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, character => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character]))
}

function scriptJson(value) {
	return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function documentShell(title, body, { nonce = '', extraScript = '' } = {}) {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f4f6f8;color:#17202a}
*{box-sizing:border-box}body{margin:0}main{max-width:720px;margin:0 auto;padding:32px 20px 56px}
h1{font-size:28px;margin:0 0 8px}p{line-height:1.5}.panel{background:#fff;border:1px solid #d7dde3;border-radius:8px;padding:20px;margin-top:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.pack{display:block;border:1px solid #bcc6d0;border-radius:8px;padding:16px;color:inherit;text-decoration:none}
.pack:hover{border-color:#1473e6}.label{font-size:13px;color:#5d6b78}.value{font-size:20px;font-weight:700;margin-top:4px}
.address{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere;background:#f4f6f8;padding:12px;border-radius:6px}
.button{display:inline-flex;align-items:center;justify-content:center;background:#1473e6;color:#fff;border-radius:6px;padding:11px 16px;text-decoration:none;border:0;font-weight:650;cursor:pointer}
.button.secondary{background:#263746}.button:disabled{background:#8a98a6;cursor:not-allowed}.status{font-weight:700;text-transform:capitalize}.notice{border-left:4px solid #d97706;padding-left:12px;color:#4b5563}.qr{width:220px;height:220px;display:block;margin:12px auto}
.actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.method-title{font-size:18px;font-weight:700;margin:0 0 6px}.muted{color:#5d6b78}
input{width:100%;border:1px solid #bcc6d0;border-radius:6px;padding:10px;font:inherit;margin:8px 0 12px}
form.pack{background:#fff}
</style>
</head>
<body><main>${body}</main>${nonce ? `<script nonce="${escapeHtml(nonce)}">
const node=document.querySelector('[data-order-status]');
if(node){setInterval(async()=>{try{const response=await fetch(node.dataset.orderStatus,{cache:'no-store'});if(!response.ok)return;const data=await response.json();node.textContent=data.status.replaceAll('_',' ');document.querySelector('[data-credits]').textContent=String(data.creditedCredits||0)}catch{}},5000)}
${extraScript}
</script>` : ''}</body>
</html>`
}

export function renderPackSelection({ token, packs, cardOnramp = null }) {
	const links = packs.map(pack => `<a class="pack" href="/pay/orders/new?token=${encodeURIComponent(token)}&pack=${encodeURIComponent(pack.id)}">
<div class="label">${escapeHtml(pack.id)}</div>
<div class="value">${escapeHtml(pack.credits)} credits</div>
<div>${escapeHtml(pack.priceUsdc)} USDC on ${escapeHtml(pack.network)}</div>
</a>`).join('')
	const cardForms = cardOnramp?.enabled ? packs.map(pack => `<form class="pack" method="post" action="/pay/payram/intents">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<input type="hidden" name="packId" value="${escapeHtml(pack.id)}">
<div class="label">${escapeHtml(pack.id)}</div>
<div class="value">${escapeHtml(pack.credits)} credits</div>
<div>${escapeHtml(pack.priceUsdc)} USD card/onramp checkout</div>
<label class="label" for="payram-email-${escapeHtml(pack.id)}" style="display:block;margin-top:12px">Email for PayRam checkout (required if a balance remains)</label>
<input id="payram-email-${escapeHtml(pack.id)}" name="customerEmail" type="email" autocomplete="email" placeholder="you@example.com">
<label class="label" for="payram-promo-${escapeHtml(pack.id)}" style="display:block">Promo code (optional)</label>
<input id="payram-promo-${escapeHtml(pack.id)}" name="promoCode" type="text" autocomplete="off" maxlength="128" placeholder="Enter an owner-issued code">
<button class="button" type="submit">Pay by card</button>
</form>`).join('') : ''
	return documentShell('Choose a BetterPPTX credit pack', `
<h1>Choose a credit pack</h1>
<p>Prepaid BetterPPTX credits are added after the payment is verified.</p>
${cardForms ? `<div class="panel">
<div class="method-title">Add BetterPPTX credits by card</div>
<p class="muted">PayRam opens a card/onramp checkout. First-time card users may complete PayRam or partner verification. Credits are added only after BetterPPTX verifies the PayRam status API.</p>
<div class="grid">${cardForms}</div>
</div>` : ''}
<div class="panel">
<div class="method-title">Fund local companion wallet or external wallet</div>
<p class="muted">Use direct Base USDC transfer or the browser-wallet gasless path on the next page. Send only canonical USDC on Base.</p>
<div class="grid">${links}</div>
</div>
<div class="panel notice">Pack values shown here are current service configuration. Transfers are public and irreversible. Send only canonical USDC on Base.</div>
`)
}

export async function renderOrderPage(order, { nonce = '', gasless = null } = {}) {
	const amountBaseUnits = Math.round(Number(order.displayUsdc || 0) * 1e6)
	const walletUri = `ethereum:${order.tokenContract}@${order.chainId}/transfer?address=${order.depositAddress}&uint256=${amountBaseUnits}`
	const qr = await QRCode.toDataURL(walletUri, {
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 440,
		color: { dark: '#17202a', light: '#ffffff' },
	})
	const gaslessScript = gasless && nonce ? `
const gaslessButton=document.querySelector('[data-gasless-pay]');
const gaslessStatus=document.querySelector('[data-gasless-status]');
let pendingSettlement=null;
const gaslessConfig=${scriptJson({
		endpoint: gasless?.endpoint || '',
		token: gasless?.token || '',
		amountAtomic: String(amountBaseUnits),
		credits: Number(order.expectedCredits),
		chainId: Number(order.chainId),
		tokenContract: String(order.tokenContract).toLowerCase(),
		journalKey: `betterpptx.payment.${String(order.orderId)}`,
	})};
let paymentJournalAvailable=true;
try{
	const saved=sessionStorage.getItem(gaslessConfig.journalKey);
	if(saved){
		pendingSettlement=JSON.parse(saved);
		const target=new URL(pendingSettlement.url,location.href);
		if(target.origin!==location.origin||target.username||target.password||!pendingSettlement.quoteId)throw new Error('Invalid payment journal.');
	}
}catch{paymentJournalAvailable=false;}
function persistPayment(payment){
	try{sessionStorage.setItem(gaslessConfig.journalKey,JSON.stringify(payment));}
	catch{throw new Error('The pending payment could not be saved. Restore browser storage before making a payment.');}
	pendingSettlement=payment;
}
function setGaslessStatus(message,state){
	if(!gaslessStatus)return;
	gaslessStatus.textContent=message;
	gaslessStatus.dataset.state=state||'';
}
async function jsonResponse(response){
	const text=await response.text();
	try{return text?JSON.parse(text):{};}catch{return {error:{code:'INVALID_RESPONSE',message:'Payment service returned an invalid response.'}};}
}
async function requestQuote(){
	const target=new URL(gaslessConfig.endpoint,location.href);
	if(target.origin!==location.origin||target.username||target.password||target.hash||target.search)throw new Error('Payment endpoint is invalid.');
	target.searchParams.set('token',gaslessConfig.token);
	const url=target.toString();
	const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',redirect:'error'});
	const body=await jsonResponse(response);
	if(response.redirected||response.status!==402)throw new Error('Unable to create payment request.');
	return {url,quote:body};
}
async function settleQuote(url,quoteId,paymentPayload){
	for(let attempt=0;attempt<12;attempt+=1){
		const response=await fetch(url,{
			method:'POST',
			headers:{'Content-Type':'application/json'},
			body:JSON.stringify({quoteId,paymentPayload}),
			cache:'no-store',
			redirect:'error'
		});
		const body=await jsonResponse(response);
		if(response.ok&&!response.redirected&&body.settled===true&&Number(body.creditedCredits)===gaslessConfig.credits)return body;
		if(response.status===503&&body.error?.code==='X402_SETTLEMENT_PENDING'){
			setGaslessStatus('Payment submitted. Waiting for Base confirmation...','pending');
			await new Promise(resolve=>setTimeout(resolve,5000));
			continue;
		}
		throw new Error('Payment confirmation was not verified. Retry confirmation without signing another payment.');
	}
	throw new Error('Payment confirmation is still pending. Retry this button without signing a second payment.');
}
async function payGasless(){
	if(!globalThis.ethereum)throw new Error('No compatible browser wallet was detected. Use the QR code or open-wallet option below.');
	gaslessButton.disabled=true;
	try{
		if(!paymentJournalAvailable)throw new Error('The local payment journal is unavailable. Reconcile any earlier payment before continuing.');
		if(pendingSettlement){
			if(pendingSettlement.completed){setGaslessStatus('This payment was already confirmed. You can return to the AI client.','credited');gaslessButton.textContent='Credits added';return;}
			if(!pendingSettlement.paymentPayload)throw new Error('A previous wallet approval was interrupted. Reconcile that quote before making another payment.');
			setGaslessStatus('Retrying Base confirmation...','pending');
			const retried=await settleQuote(pendingSettlement.url,pendingSettlement.quoteId,pendingSettlement.paymentPayload);
			persistPayment({url:pendingSettlement.url,quoteId:pendingSettlement.quoteId,completed:true});
			setGaslessStatus(String(retried.creditedCredits||0)+' BetterPPTX credits added. You can return to the AI client.','credited');
			gaslessButton.textContent='Credits added';
			return;
		}
		setGaslessStatus('Preparing the USDC authorization...','pending');
		const requested=await requestQuote();
		const quote=requested.quote;
		const accepted=quote.accepts?.[0];
		if(!accepted||accepted.scheme!=='exact'||accepted.extra?.authorizationBinding!=='quote_nonce_v1'
			||!/^0x[a-fA-F0-9]{64}$/.test(accepted.extra?.authorizationNonce||'')||!quote.quoteId||accepted.extra?.quoteId!==quote.quoteId)
			throw new Error('Request a fresh payment quote before signing.');
		const chainId=Number(String(accepted.network||'').split(':').pop());
		if(chainId!==8453||gaslessConfig.chainId!==8453||accepted.network!=='eip155:8453'
			||String(accepted.asset).toLowerCase()!==gaslessConfig.tokenContract
			||gaslessConfig.tokenContract!=='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
			||String(accepted.amount)!==gaslessConfig.amountAtomic||Number(quote.credits)!==gaslessConfig.credits
			||accepted.extra?.name!=='USD Coin'||accepted.extra?.version!=='2'||accepted.extra?.assetDecimals!==6
			||!/^0x[a-fA-F0-9]{40}$/.test(accepted.payTo||''))throw new Error('Payment terms do not match this order.');
		const expiresAt=Math.floor(Date.parse(quote.expiresAt)/1000);
		if(!Number.isSafeInteger(expiresAt)||expiresAt<=Math.floor(Date.now()/1000)+5)throw new Error('Payment quote has expired.');
		const chainHex='0x'+chainId.toString(16);
		const accounts=await globalThis.ethereum.request({method:'eth_requestAccounts'});
		const from=String(accounts?.[0]||'').toLowerCase();
		if(!/^0x[a-f0-9]{40}$/.test(from))throw new Error('Wallet did not return a valid account.');
		const currentChain=await globalThis.ethereum.request({method:'eth_chainId'});
		if(String(currentChain).toLowerCase()!==chainHex.toLowerCase()){
			await globalThis.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:chainHex}]});
		}
		const validBefore=Math.min(Math.floor(Date.now()/1000)+600,expiresAt-1);
		if(validBefore<=Math.floor(Date.now()/1000))throw new Error('Payment quote expired before signing.');
		const authorization={
			from,
			to:String(accepted.payTo).toLowerCase(),
			value:String(accepted.amount),
			validAfter:'0',
			validBefore:String(validBefore),
			nonce:accepted.extra.authorizationNonce
		};
		const typedData={
			types:{
				EIP712Domain:[
					{name:'name',type:'string'},
					{name:'version',type:'string'},
					{name:'chainId',type:'uint256'},
					{name:'verifyingContract',type:'address'}
				],
				TransferWithAuthorization:[
					{name:'from',type:'address'},
					{name:'to',type:'address'},
					{name:'value',type:'uint256'},
					{name:'validAfter',type:'uint256'},
					{name:'validBefore',type:'uint256'},
					{name:'nonce',type:'bytes32'}
				]
			},
			primaryType:'TransferWithAuthorization',
			domain:{
				name:accepted.extra.name,
				version:accepted.extra.version,
				chainId,
				verifyingContract:String(accepted.asset).toLowerCase()
			},
			message:authorization
		};
		setGaslessStatus('Approve the USDC payment in your wallet. No Base ETH is required.','pending');
		persistPayment({url:requested.url,quoteId:quote.quoteId});
		let signature;
		try{signature=await globalThis.ethereum.request({
			method:'eth_signTypedData_v4',
			params:[from,JSON.stringify(typedData)]
		});}catch(error){
			if(error?.code===4001){sessionStorage.removeItem(gaslessConfig.journalKey);pendingSettlement=null;}
			throw error;
		}
		const paymentPayload={signature,authorization};
		persistPayment({url:requested.url,quoteId:quote.quoteId,paymentPayload});
		setGaslessStatus('Submitting the signed authorization...','pending');
		const result=await settleQuote(requested.url,quote.quoteId,paymentPayload);
		persistPayment({url:requested.url,quoteId:quote.quoteId,completed:true});
		setGaslessStatus(String(result.creditedCredits||0)+' BetterPPTX credits added. You can return to the AI client.','credited');
		gaslessButton.textContent='Credits added';
	}catch(error){
		setGaslessStatus(String(error?.message||error||'Payment failed.'),'error');
		if(pendingSettlement)gaslessButton.textContent='Retry confirmation';
		gaslessButton.disabled=false;
	}
}
if(gaslessButton){
	if(!globalThis.ethereum)setGaslessStatus('No browser wallet detected. Use the QR code or open-wallet option.','unavailable');
	gaslessButton.addEventListener('click',payGasless);
}
` : ''
	return documentShell(`BetterPPTX payment ${order.orderId}`, `
<h1>Pay with USDC on Base</h1>
<p>Order <strong>${escapeHtml(order.orderId)}</strong> adds ${escapeHtml(order.expectedCredits)} BetterPPTX credits.</p>
${gasless ? `<div class="panel">
<div class="method-title">Browser wallet: gasless authorization</div>
<p class="muted">Use USDC already in an injected wallet. BetterPPTX pays the Base network gas; your wallet only signs the exact USDC authorization.</p>
<div class="actions"><button class="button secondary" type="button" data-gasless-pay>Connect wallet and pay</button></div>
<p class="status" data-gasless-status>Ready</p>
</div>` : ''}
<div class="panel">
<div class="method-title">Mobile or external wallet: direct transfer</div>
<div class="label">Exact amount</div><div class="value">${escapeHtml(order.displayUsdc)} USDC</div>
<div class="label" style="margin-top:16px">Network</div><div>Base (chain ${escapeHtml(order.chainId)})</div>
<div class="label" style="margin-top:16px">Canonical USDC contract</div><div class="address">${escapeHtml(order.tokenContract)}</div>
<div class="label" style="margin-top:16px">Single-use deposit address</div><div class="address">${escapeHtml(order.depositAddress)}</div>
<img class="qr" src="${qr}" alt="Wallet payment QR code">
<a class="button" href="${escapeHtml(walletUri)}">Open wallet</a>
</div>
<div class="panel">
<div class="label">Direct-transfer status</div>
<div class="status" data-order-status="/pay/orders/${encodeURIComponent(order.orderId)}/status">${escapeHtml(order.status)}</div>
<p><span data-credits>${escapeHtml(order.creditedCredits || 0)}</span> credits confirmed so far.</p>
</div>
<div class="panel notice">Choose one payment method only. Blockchain transfers are public and irreversible. Do not send another token or use another network. BetterPPTX cannot automatically refund mistaken transfers.</div>
	`, { nonce, extraScript: gaslessScript })
}

export async function renderWalletFundingPage({
	address,
	requiredUsdc,
	statusUrl,
	networkName = 'Base',
	chainId = 8453,
	nonce = '',
} = {}) {
	const qr = await QRCode.toDataURL(String(address), {
		errorCorrectionLevel: 'M',
		margin: 1,
		width: 440,
		color: { dark: '#17202a', light: '#ffffff' },
	})
	const fundingScript = nonce ? `
const fundingNode=document.querySelector('[data-funding-status]');
const balanceNode=document.querySelector('[data-wallet-balance]');
const shortfallNode=document.querySelector('[data-wallet-shortfall]');
const fundedPanel=document.querySelector('[data-funded-panel]');
let fundingComplete=false;
async function refreshFunding(){
	if(fundingComplete)return;
	try{
		const response=await fetch(${scriptJson(String(statusUrl))},{cache:'no-store',redirect:'error'});
		if(!response.ok)return;
		const data=await response.json();
		balanceNode.textContent=String(data.balanceUsdc||'0')+' USDC';
		shortfallNode.textContent=String(data.shortfallUsdc||'0')+' USDC';
		if(data.funded){
			fundingComplete=true;
			fundingNode.textContent='Funded';
			fundingNode.dataset.state='funded';
			fundedPanel.hidden=false;
			document.title='BetterPPTX wallet funded';
		}else{
			fundingNode.textContent='Waiting for '+${scriptJson(String(networkName))}+' USDC';
		}
	}catch{}
}
refreshFunding();
setInterval(refreshFunding,3000);
` : ''
	return documentShell('Fund the BetterPPTX payment wallet', `
<h1>Fund your BetterPPTX wallet</h1>
<p>The interrupted MCP operation is waiting. Send enough canonical USDC on ${escapeHtml(networkName)} to this local wallet address. The connector will pay and resume automatically after the balance is detected.</p>
<div class="panel">
<div class="label">Required wallet balance</div><div class="value">${escapeHtml(requiredUsdc)} USDC</div>
<div class="label" style="margin-top:16px">Network</div><div>${escapeHtml(networkName)} (chain ${escapeHtml(chainId)})</div>
<div class="label" style="margin-top:16px">Asset</div><div>Canonical USDC</div>
<div class="label" style="margin-top:16px">Your local wallet address</div>
<div class="address">${escapeHtml(address)}</div>
<img class="qr" src="${qr}" alt="BetterPPTX wallet funding address QR code">
</div>
<div class="panel">
<div class="label">Funding status</div>
<div class="status" data-funding-status>Checking Base...</div>
<p>Current balance: <strong data-wallet-balance>Checking...</strong></p>
<p>Remaining shortfall: <strong data-wallet-shortfall>Checking...</strong></p>
</div>
<div class="panel" data-funded-panel hidden>
<div class="method-title">Wallet funded</div>
<p>The connector is completing the payment and retrying the interrupted BetterPPTX operation. You may close this page.</p>
</div>
<div class="panel notice">Send USDC only on Base. Transfers to this address on another network will not fund the automatic payment flow.</div>
`, { nonce, extraScript: fundingScript })
}

export function renderPaymentError(message = 'This payment link is unavailable.') {
	return documentShell('BetterPPTX payment unavailable', `
<h1>Payment link unavailable</h1>
<div class="panel"><p>${escapeHtml(message)}</p><p>Return to the AI client and request a fresh BetterPPTX top-up link.</p></div>
`)
}
