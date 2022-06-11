const { ServiceBusClient } = require("@azure/service-bus");
const express = require('express');
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()

const app = express();
const keys = require('./config/keys');
const stripe = require('stripe');

const connectionString = keys.creds.AzSBConnectionString;
const queueName = "akdctransferrequest";
const solQueueName = "akdcsoltransferrequest";
const sbClient = new ServiceBusClient(connectionString);
const sender = sbClient.createSender(queueName);
const senderSol = sbClient.createSender(solQueueName);

const endpointSecret = keys.creds.StripeWHSecret;
const cryptoSolSecret = keys.creds.SolTransferPostSecret;

app.post('/cryptosol',
jsonParser,
async (req,res)=>{

const reqSecret = req.query.solsecret;

if(reqSecret !== cryptoSolSecret)
{
  res.status(400).send(`Crypto Sol Secret Missing`);
  return;
}
let sbMessage = await sender.createMessageBatch();
const messageBody = {
    command:"Transfer",
    destWallet:req.body.walletAddress,            
    akdcs:(req.body.amount/100).toFixed(2),
    transactionHash:req.body.txHash
};        

if(!sbMessage.tryAddMessage({body:messageBody,contentType:"application/json"}))
{
    res.status = 500;
    res.send("Failed to send message");
    return;
}

await senderSol.sendMessages(sbMessage);

res.send({message:'Transfer Completed!'});
});

app.post('/webhook',
    express.raw({type: 'application/json'}),
    async (req,res)=>{

    const sig = req.headers['stripe-signature'];
    
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    let paymentIntent=null;
    switch (event.type) {
        case 'payment_intent.succeeded':
          paymentIntent = event.data.object;
          // Then define and call a function to handle the event payment_intent.succeeded
          break;
        
        default:
          console.log(`Unhandled event type ${event.type}`);
    }

    if(paymentIntent)
    {
        let sbMessage = await sender.createMessageBatch();
        const messageBody = {
            command:"Fulfill",
            destWallet:paymentIntent.metadata.walletAddress,            
            akdcs:(paymentIntent.amount/100).toFixed(2),
            stripePaymentIntent:paymentIntent.id
        };        
    
        if(!sbMessage.tryAddMessage({body:messageBody,contentType:"application/json"}))
        {
            res.status = 500;
            res.send("Failed to send message");
            return;
        }
        
        await sender.sendMessages(sbMessage);
    }
    
    res.send({message:'Payout Completed!'});
});

const PORT = process.env.PORT || 5000; 
app.listen(PORT);