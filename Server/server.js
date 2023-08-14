const { Configuration, OpenAIApi } = require("openai");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const spawn = require("child_process").spawn;
const unirest = require("unirest");
const cheerio = require("cheerio");
const fs = require("fs");
const sql = require("mssql");
const readline = require("readline");
const nodemailer = require("nodemailer");
const path = require("path");
require('dotenv').config();
const nodecallspython = require("node-calls-python");

const app = express();
const py = nodecallspython.interpreter;

const tableName1 = process.env.TABLENAME1;
const tableName2 = process.env.TABLENAME2;
var scrapedData = [];
var scrapedDataShort = [];
var scrapedDataVar = [];

var guarantee =
    `<h2> Garanti og forsendelse </h2> Vi gør vores bedste for at teste al elektronik inden vi sender det ud til dig. <br>Dette sikrer at vi gør et godt stykke arbejde og at du undgår unødig bøvl i din udviklingsprocess. Fejl kan forekomme, men det er noget vi ser utrolig sjældent. Forekommer der problemer med det bestilte udstyr kan du altid kontakte os <a href=""https://ebits.dk/pages/om-os"">HER</a>, så hjælper vi dig glædeligt med at løse problemet. \nAfhængig af vores interne og eksterne lager situation leveres den bestilte ordre mellem 1-3 uger efter bestilling. De fleste modtager deres ordre indenfor 10 hverdage.`;
var reservations = `Der tages forbehold for fejl og mangler i produktbeskrivelsen. Kontakt os gerne på kontakt@ebits.dk for uddybende information omkring denne vare.`;
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);
/*
 function allModels() {
openai.listModels().then((result) => {
    console.log(result.data);
});
}
*/

app.use(
    cors({
        origin: "*"
    })
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(express.json());
app.use(express.static('public'));

//config for connecting to the MSSQL database.
var config = {
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    server: process.env.DATABASE_IP,
    database: process.env.DATABASE_NAME,
    connectionTimeout: 3,
    trustServerCertificate: true
};
sql.on('error',
    err => {
        console.log(err.message);
    }
);

function WipeInternalData() {
    scrapedData = [];
    scrapedDataShort = [];
    scrapedDataVar = [];
	asyncRunner();
}

//Writes images to file from img uri.
var download = async function (uri, filename) {
    return new Promise(async (resolve) => {
        unirest.get(uri)
            .encoding(null) // Added
            .end(async (res) => {
                //YES I just resolve any promises that go unfulfilled and try the download again, what of it?
                if (res.error) {
                    resolve();
                    return download(uri, filename);
                }
                const data = Buffer.from(res.raw_body);
                fs.writeFileSync(filename, data, 'binary'); // Modified or fs.writeFileSync(pageName + '.png', data);
                return resolve();
            });
    });
}

//Receives all records from a specific table in the database described in config.
async function getAllProducts(tableName) {
    try {
        let pool = await sql.connect(config);
        let result1 = await pool.request().query(`select * from ${tableName}`);
        sql.close();
        let array = result1.recordset;
        console.log(`Found following amount of entries: ${array.length} in ${tableName}`);
        return array;
    } catch (error) {
        console.log(error);
        sql.close();
        return [];
    }
}
//Receives all x from records found in a specific table in the database described in the config.
async function getAllX(tableName, x) {
    try {
        let pool = await sql.connect(config);
        let result1 = await pool.request().query(`select ProductIndex, ${x} from ${tableName}`);
        sql.close();
        let array = result1.recordset;
        return array;
    } catch (error) {
        console.log(error);
        sql.close();
        return [];
    }
}

//Receives a request, from which it will extract the ProductIndex and VariationID(if applicable) to grab a specific entry in the database
//or all variations of a specific product if no variationID is specified.
function getSpecificProductByID(req, tableName) {
    let obj;
    if (tableName == tableName1) {
        obj = scrapedDataShort.find(prod => prod.ProductIndex === Number(req.body.ProductIndex));
    }
    else if (!isNaN(req.body.VariationID)) {
        obj = scrapedDataVar.filter(prodVar => prodVar.ProductIndex === Number(req.body.ProductIndex) &&
            prodVar.VariationID === Number(req.body.VariationID));
    } else {
        obj = scrapedDataVar.filter(prodVar => prodVar.ProductIndex === Number(req.body.ProductIndex));
    }
    return obj;
}
//splits an array of descriptions and their respective ProductIndexes into arrays of length 200. (this done, because MSSQL has a hard limit of 1000 entries at a time)
//then updates the descriptions in the database table one array at a time, so 200 entries at a time.
async function setDescriptions(objArray) {
    //console.log(objArray);
    var arr = objArray;
    var splitterArr = [];
    var updaterArr = [];
    while (arr.length > 0) {
        splitterArr.push(arr.splice(0, 200));
    }
    await splitterArr;
    for (var i = 0; i < splitterArr.length; i++) {
        var updater = ``;
        //console.log(splitterArr[i][0].length);
        if (splitterArr[i][0].length == 2) {
            //console.log(splitterArr[i][0].length);
            //console.log(splitterArr[i][0][0]);
            //console.log(splitterArr[i][0][1]);
            //console.log(splitterArr[i][0][1].length);
            if (splitterArr[i][0][1].length == 2) {
                updater = `UPDATE e SET Description = t.Description, SKU = t.SKU FROM dbo.${tableName1} e JOIN (VALUES`;
            }
            else {
                updater = `UPDATE e SET Description = t.Description FROM dbo.${tableName1} e JOIN (VALUES`;
            }
        }
        else if (splitterArr[i][0].length == 3) {
            updater = `UPDATE e SET Description = t.Description, TechnicalSpecifications = t.TechnicalSpecifications FROM dbo.${tableName1} e JOIN (VALUES`;
        }
        /*
        else if (splitterArr[i][0].length == 4) {
            updater = `UPDATE e SET Description = t.Description, Confidence = t.Confidence, TechnicalSpecifications = t.TechnicalSpecifications FROM dbo.${tableName1} e JOIN (VALUES`;
        }
        */
        for (var j = 0; j < splitterArr[i].length; j++) {
            updater += `\(`;
            for (var k = 0; k < splitterArr[i][j].length; k++) {
                if (k == 0) {
                    updater += `${splitterArr[i][j][k]}, `;
                } else if (k == 1) {
                    if (splitterArr[i][0][1].length == 2) {
                        for (z = 0; z < splitterArr[i][0][1].length; z++) {
                            updater += `\'${await splitterArr[i][j][k][z]}\', `;
                        }
                    } else {
                        updater += `\'${splitterArr[i][j][k]}\', `;
                    }
                }
                else {
                    updater += `\'${splitterArr[i][j][k]}\', `;
                }
            }
            updater = updater.slice(0, -2);
            updater += `\), `;
        }
        updater = updater.slice(0, -2);
        if (splitterArr[i][0].length == 2) {
            if (splitterArr[i][0][1].length == 2) {
                updater += `) t (ProductIndex, Description, SKU) ON t.ProductIndex = e.ProductIndex`;
            }
            else {
                updater += `) t (ProductIndex, Description) ON t.ProductIndex = e.ProductIndex`;
            }
        }
        else if (splitterArr[i][0].length == 3) {
            updater += `) t (ProductIndex, Description, TechnicalSpecifications) ON t.ProductIndex = e.ProductIndex`;
        }
        /*
        else if (splitterArr[i][0].length == 4) {
            updater += `) t (ProductIndex, Description, TechnicalSpecifications, Confidence) ON t.ProductIndex = e.ProductIndex`;
        }
        */
        await updaterArr.push(updater);
    }

    //console.log(updaterArr[0]);

    return await SendDescriptsToDatabase(updaterArr);
}
async function SendDescriptsToDatabase(updaterArr)
{
    try {
        let pool = await sql.connect(config);
        for (const updater of updaterArr) {
            await pool.request().query(updater);
        }
        sql.close();
        return "Job's done!";
    } catch (error) {
        console.log(error);
        console.log("Trying to write a .json file that contains the offending array...")
        var translateIntoJson = (arrToFile) => {
            if (arrToFile.length !== 0) {
                let jhElectronicaProductObject = {
                    Products: arrToFile
                };
                fs.writeFile(
                    "./outputForGeneration.json",
                    JSON.stringify(jhElectronicaProductObject, null, 2),
                    (err) => {
                        if (err) {
                            console.log(err);
                        } else {
                            console.log("file successfully created");
                        }
                    }
                );
            } else {
                console.log("Action impossible due to lack of information");
            }
        };
        translateIntoJson(updaterArr);
        sql.close();
    }
}
/*
async function setSKU(objArray) {
    var arr = objArray;
    var splitterArr = [];
    var updaterArr = [];
    while (arr.length > 0) {
        splitterArr.push(arr.splice(0, 200));
    }

    for (var i = 0; i < splitterArr.length; i++) {
        var updater = ``;
        updater = `UPDATE e SET SKU = t.SKU FROM dbo.${tableName1} e JOIN (VALUES`;
        for (var j = 0; j < splitterArr[i].length; j++) {
            updater += `\(`;
            for (var k = 0; k < splitterArr[i][j].length; k++) {
                if (k == 0) {
                    updater += `${splitterArr[i][j][k]}, `;
                } else {
                    updater += `\'${splitterArr[i][j][k]}\', `;
                }
            }
            updater = updater.slice(0, -2);
            updater += `\), `;
        }
        updater = updater.slice(0, -2);
        if (splitterArr[i][0].length == 2) {
            updater += `) t (ProductIndex, SKU) ON t.ProductIndex = e.ProductIndex`;
        }
        await updaterArr.push(updater);

        //console.log(updaterArr[0]);
        try {
            let pool = await sql.connect(config);
            for (const updater of updaterArr) {
                await pool.request().query(updater);
                WipeInternalData();
            }
            sql.close();
        } catch (error) {
            console.log(error);
            sql.close();
        }
    }
}
*/
//Function to send requests to openAI's API, for getting ChatGPT generated Product Descriptions.
async function OpenAIRequest(product, choice) {
    return new Promise(async (resolve) => {
        try {
            choice = choice.toLowerCase();
            
            var res = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [
                    {
                        role: "user",
                        content: choice == "description" ? `Write me a product description for the product called "${product.ProductName}", which incorporates humor and is around 400 characters long.`
                            : choice == "oneliner" ? `Write me a short witty introduction for the product called "${product.ProductName}" in one sentence.`
                                : `Write me a technical specification sheet for the product called "${product.ProductName}" as a table in HTML using <table>, <tbody>, <tr> and <td> tags.`
                    }
                ]
            });
            var result = res.data.choices[0].message.content.trim().replaceAll(/\'/g, "\'\'").replace(/\n\n/g, "\n").replace(/\n\r\n\r/g, "\n");
            
            //throw new Error('This is an error. Please handle it correctly, instead of just passing on.');

            if (choice != "description" && choice != "oneliner")
            {
                toreplace = result.match(/<\s*([hH]\d+)\b[^>]*>.*Technical Specifications.*<\/\1\s*>/g);
                if (toreplace) {
                    result.replaceAll(toreplace[0], "");
                }
                let toreplace1 = result.match(/<\s*([hH]\d+)\b[^>]*>/);
                let toreplace2 = result.match(/<\/\s*([hH]\d+)\b[^>]*>/);
                if (toreplace1) {
                    result.replaceAll(toreplace1[0], "");
                }
                if (toreplace2) {
                    result.replaceAll(toreplace2[0], "");
                }
                result = "<br><br><b>Technical Specifications </b><br>" + result;
            }
            
            return resolve(result);
            //return `This is: ${choice} for ${product.ProductIndex}`;
        }
        catch (error) {
            console.log(error);
            console.log("waiting for ", 10000.0/1000, " seconds, then trying again.")
            new Promise((resolve, reject) => {
                setTimeout(resolve, 10000, 1);
            }).then(() => {
                return resolve(OpenAIRequest(product, choice));
            });
        }
    });
}

//simple function to use the other functions to generate and display a ChatGPT generated product description.
async function GenerateForProduct(productName) {
    var arr = [];
    var product = { ProductName: productName }
    var oneliner = await OpenAIRequest(product, "oneliner");
    if (oneliner[0] == "\"")
    {
        oneliner = oneliner.slice(1, -2);
    }
    var description = await OpenAIRequest(product, "description");
    var tchspecandconf = await OpenAIRequest(product, "tchspecandconf");
    /*
    var tchandconfsplit = await tchspecandconf.split(`\n`);
    var confidence = "";
    while (!confidence) {
        confidence = tchandconfsplit.splice(-1).toString();
    }
    */
    var cmbined = "<b>" + oneliner + "</b>" + "<br>" + description;
    arr.push(cmbined);
    arr.push(tchspecandconf);
    //arr.push(await confidence.toString().trim());

    return await arr;
}

//It splits the array into multiple parts to limit the amount of requests sent at once (since we really don't want to DoS anyone)
//Delegates work to another function, OpenAIRequest, for the array. Features a default parameter of amount, mostly just for testing actually.
async function GenerateAndSetDescription(amount = scrapedData.length) {
    var arr = scrapedData.slice(0, amount);
    var arrayOfAllDesc = [];
    while (arr.length > 0) {
        let smallerArray = await arr.slice(0, 4);
        arr = await arr.slice(4);
        await Promise.all(smallerArray.map(async (product) => {
            console.log("Waiting for response from product with index: " + product.ProductIndex);

            var generatedArr = await GenerateForProduct(product.ProductName);
            generatedArr.unshift(product.ProductIndex);
            //var oneliner = await OpenAIRequest(product, "oneliner");
            //var description = await OpenAIRequest(product, "description");
            //var techandconf = await OpenAIRequest(product, "technicalandconf");
            
            arrayOfAllDesc.push(generatedArr);
        }));
    }
    //console.log(await arrayOfAllDesc);
    //console.log(await arrayOfAllDesc[0].length);
    //console.log(await arrayOfAllDesc[0][1][arrayOfAllDesc[0][1].length-1]);

    

    setDescriptions(await arrayOfAllDesc);
}

//Sets up sql queries containing all the data to be inserted in the table, multiple because there is a hard limit of 1000 entries at a time in MSSQL
//then sends all those queries to the database one at a time.
async function sendMultiProductsPart(objArray, tableName) {
    var inserterArr = [];
    objArray.forEach(async (arr) => {
        let inserter = `insert into ${tableName} values `;
        if (tableName == tableName1) {
            arr.forEach((element, index) => inserter += (`\(${element.ProductIndex}, \'${element.ProductName}\', \'${element.Price}\', N\'${null}\', N\'${element.ProductLink}\', \'${null}\', \'${null}\', \'${null}\'\), `));
        }
        else if (tableName == tableName2) {
            //arr.forEach((element, index) => element[1].forEach((elem, ind) => inserter += (`\(${element[0]}, \'${ind + 1}\', N\'${element[2][0][0]}\',  N\'${element[2][1][0][ind % element[2][1][0].length]}\', N\'${element[2][0][1]}\',  N\'${element[2][1][1][ind]}\', \'${elem}\'\), `)));

            console.log(arr[0]);
            console.log(arr[0][2][1]);
            //arr.forEach((element, index) => element[2][1].forEach((elm, ind) => elm.forEach((el, inde) => console.log(el))));
            for (j = 0; j < arr.length; j++) {
                let PriceCorrector = 0;
                let ImgArray = [];
                arr[j][2][2].sort((a, b) => a - b);
                for (x = 0; x < arr[j][2][1].length; x++)
                {
                    if (arr[j][2][1][x].find(a => a.includes("img:"))) {
                        console.log("triggered for: " + arr[j][2][1][x]);
                        for (y = 0; y < arr[j][2][1][x].length; y++)
                        {
                            if (arr[j][2][1][x][y].includes("img:")) {
                                let varName = arr[j][2][1][x][y].replace(/img:\d+/g, "").trim();
                                ImgArray.push(arr[j][2][1][x][y].replace(varName, "").trim());
                                arr[j][2][1][x][y] = varName;
                                //console.log(arr[j][2][1][x][y]);
                            } else
                            {
                                ImgArray.push("");
                            }
                            
                        }
                        ImgArray.unshift(arr[j][2][1][x]);
                        console.log(ImgArray);
                    }
                    else
                    {
                        console.log("untriggered for: " + arr[j][2][1][x]);
                    }
                }
                for (i = 0; i < arr[j][2][1][0].length; i++) {
                    console.log("i: " + i)
                    //console.log("crash" + arr[j][2][1][1].length);
                    
                    for (k = 0; k < arr[j][2][1][1].length; k++) {
                        console.log("k: " + k)
                        if (!arr[j][2][2].includes((i * arr[j][2][1][1].length) + k)) {
                            inserter += (`\(${arr[j][0]}, \'${(i * arr[j][2][1][1].length) + k + 1 - PriceCorrector}\', N\'${arr[j][2][0][0]}\',  N\'${arr[j][2][1][0][i]}\', N\'${arr[j][2][0][1]}\',  N\'${arr[j][2][1][1][k]}\', \'${arr[j][1][(i * arr[j][2][1][1].length) + k - PriceCorrector]}\', ${ImgArray[0][k] == arr[j][2][1][1][k] ? ImgArray[k+1] : 1}\), `);
                        }
                        else
                        {
                            PriceCorrector++;
                        }
                    
                    //console.log(arr[j][2][1][0][i]);
                    //console.log(arr[j][2][1][1][k]);
                    }
                    
                }
            }
            

            /*
            for (i = 0; i < nameBefore.length; i++) {
                for (j = 0; j < nameBefore[i].length; j++) {
                    nameBefore[i][j] = arr[i % arr.length].charAt(0) + nameBefore[i][j] + arr[i % arr.length].charAt(1);
                }
            }
            */

            //
            //add the extra functionality here \'${element.StyleName1}\', \'${element.ProductName}\', \'${element.StyleName2}\', \'${element.ProductName2}\', \'${element.StyleName3}\', \'${element.ProductName3}\', <- Also means you have to worry about unpacking.
        }
        inserter = inserter.substring(0, inserter.length - 2) + '\;';
        inserterArr.push(inserter);
        //console.log(arr.length);
    });

    //console.log("the length of things: " + objArray.length);
    console.log("insertion string: " + inserterArr);

    /*
    try {
        let pool = await sql.connect(config);
        for (const inserter of inserterArr) {
            await pool.request().query(inserter);
        }
        sql.close();
    } catch (error) {
        console.log(error);
        sql.close();
    }
    */
}

//Receives an array of data to be inserted in a specific table in the database, and splits it into appropriate lengths.
//algorithm is different for standard products and variations, since variations are multiple entries per same ProductIndex, because there can be and there are multiple variations per product.
//deletes all existing products before new ones are inserted into the database.
async function sendMultipleProducts(objArray, tableName) {
    var arr = await objArray;

    var objArrayArray = [];
    var lengths = 0;
    var currentLength = 0;
    var arrayNum = 0;
    var lastArrayNum = 0;
    
    await arr.forEach((obj, i) => {
        if (tableName == tableName2) {
            currentLength = obj[1].length;
        }
        else if (tableName == tableName1) {
            currentLength = 1;
        }

        arrayNum = i;
        lengths += currentLength;
        //cap of 1000 rows per insert statement. Set to 600 instead, because this wrongly saves a value to be used for the next one, where it appends something before it checks the value.
        //I think, atleast.
        if (lengths >= 600) {
            lengths = currentLength;
            arrayNum -= 1;
            objArrayArray.push(arr.slice(lastArrayNum, arrayNum));
            lastArrayNum = arrayNum;
        }
    });

    objArrayArray.push(arr.slice(lastArrayNum, arr.length));

    //console.log("Below is all the records.");
    //console.log(objArrayArray);

    await deleteAllProducts(tableName);

    await sendMultiProductsPart(objArrayArray, tableName);
    
}
//deletes all products in the specified table.
async function deleteAllProducts(tableName) {
    try {
        let pool = await sql.connect(config);
        let result1 = await pool.request().query(`truncate table ${tableName}`);
        console.log("Successfully deleted all products from table: ", tableName);
        //console.log(result1);
        sql.close();
    } catch (error) {
        console.log(error);
        sql.close();
    }
}

//method for picking a random user agent to perform the scrape as.
const selectRandom = () => {
  //An array with different user agents
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64)  AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/72.0.3626.121 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.45 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.71 Safari/537.36",
    "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:42.0) Gecko/20100101 Firefox/42.0"
  ];
  var randomNumber = Math.floor(Math.random() * userAgents.length);
  return userAgents[randomNumber];
};

let user_agent = selectRandom();

//Sets the database values according to the json file "scrapedData.json" found in the same folder. Clears the entire table first.
//Largely obsolete with the changes, but kept just in case scraping to a json file first and then uploading with this will be necessary.
function UploadJsonFile() {
    let jsonFileRead = fs.readFileSync(`scrapedData.json`);
    let parsedFile = JSON.parse(jsonFileRead);
    sendMultipleProducts(parsedFile.Products, tableName1);
    console.log("Finished uploading JSON to target database table.");
}

function SetDescriptionFromJSON() {
    let jsonFileRead = fs.readFileSync(`outputForGeneration.json`);
    let parsedFile = JSON.parse(jsonFileRead);
    SendDescriptsToDatabase(parsedFile.Products);
    //setDescriptions(parsedFile.Products);
    console.log("Finished uploading JSON to target database table.");
}

//Spawns the watermarkRemover.py, to hopefully remove the watermarks of all the images provided in the img folder, and put the new images into imgMinusWatermarks.
async function pythWaterMarkSpawner() {
    return new Promise((resolve, reject) => {
        const python3 = spawn("python3",
            [
                "watermarkRemover.py"
            ]);
        python3.stdout.on('data', function (data) {
            console.log(data.toString());
        });
        python3.stderr.on('data', function (data) {
            console.error(data.toString());
        });
        //on close we resolve the Promise.
        python3.on("close", () => {
            resolve(console.log("Done running."));
        });
    });
}

//Spawns a python process, and feeds it data from the parameter. Specifically spawns Calculator.py, used for calculating the kr. price of wares based on the baseprice, the currency, and the amount of wares.
async function pythSpawner(priceNoSymbol, amount, currency, script) {
    return new Promise((resolve, reject) => {
        var dataToSend = String();
        var dataNoFormatting = String();
        const python3 = spawn("python3",
            [
                script,
                priceNoSymbol,
                amount,
                currency
            ]);
        python3.stdout.on("data",
            function (data) {
                dataToSend = data.toString();
                dataNoFormatting = dataToSend;

                //if (script == 'Calculator.py') {
                    //dataToSend = formatter(dataToSend);
                //}
                //console.log(`Requested: ${dataToSend}`);
            });
        //on close we send back whatever the results were.
        python3.on("close", () => {
            //console.log(dataNoFormatting);
            //if (Number(dataNoFormatting)) {
            if (dataNoFormatting) {
                resolve(dataToSend);
            } else {
                console.log(dataToSend);
                console.log("noformat: ", dataNoFormatting);
                resolve("?");
            }
            
        });
    });
}
//A format (for crunching numbers down to 2 decimal places)
const format = new Intl.NumberFormat("en-US",
    {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        useGrouping: false
    });
//applies the format to whatever number it is called on
function formatter(number) {
    return format.format(number);
}
//grabs the "exchange rate" for one currency to DKK. Also adds some slight expenses ontop.
async function getOneCurrToDKK(currency) {
    return new Promise((resolve, reject) => {
        pythSpawner(1, 1, currency, "Calculator.py").then((result) => {
            resolve(formatter(result));
        });
    });
}

//Function to scrape JHElectronica. Is used by other functions to either scrape to a JSON file or to put the results directly into the database table.
async function scrapeJHElectronica() {
    return unirest
    //First, we scrape the page with just 1 product, to make it load faster.
        .get("https://www.jh-electronica.com/ProductList.aspx?mode=&per=1&sj=&ej=&keys=")
        .headers({
            UserAgent: `${user_agent}`
        })
        .then((response) => {
        //from the page with one product, we use the "amount of products available" displayed on the page to scrape the productlist, but with that amount shown.
            let cheers = cheerio.load(response.body);
            let amountOfProductsToScrape = cheers('div[class="f16 fb sm-12"] > span').text();
            console.log("Discovered the following amount of products to scrape: ", amountOfProductsToScrape);
            console.log("Scraping starting, please hold.");
            return unirest
                .get(`https://www.jh-electronica.com/ProductList.aspx?mode=&per=${amountOfProductsToScrape}&sj=&ej=&keys=`)
                .headers({
                    UserAgent: `${user_agent}`
                })
                .then((response) => {
                    let $ = cheerio.load(response.body);
                    let titles = [];
                    let prices = [];
                    let link = [];
                    let indexes = [];
                    // we select the ul with class "row", and then from there go to its li then div then div then a.
                    $('ul[class="row"]')
                        .find("li > div > div > a")
                        .each(function (index, element) {
                            //from here we can select name of the product, its price and the link to it (useful later)
                            let price = $(element).find("div > em").text();
                            if (price == "$0.00") {
                                price = "$0.01";
                            } else if (price == "") {
                                return true;
                            }
                            indexes.push(index + 1);
                            prices.push(price);
                            titles.push($(element).find("h3").text());
                            link.push("https://www.jh-electronica.com" + $(element).attr("href"));
                        });
                    //we then store them in an array, with some more appropriate names for later. We used to have a picture link, but we don't anymore
                    //and since I'm lazy I just set it to null instead of swapping the order things are read in and leaving it out.
                    var results = [];
                    for (let i = 0; i < titles.length; i++) {
                        results.push({
                            ProductIndex: indexes[i],
                            ProductName: titles[i].replace(/\s+/g, " ").trim().replace(/\"/g, '\"\"')
                                .replace(/\'/g, "\'\'"),
                            Price: prices[i],
                            PictureLink: null,
                            ProductLink: link[i]
                        });
                    }

                    console.log("Number of products obtained: " + results.length);
                    return results;
                });
        });
}
//ScrapesJHElectronica and returns all the products names, prices, picturelinks and productlinks in an array, that gets converted to Json.
async function scrapeJHElectronicaToJSON() {
    var results = await scrapeJHElectronica();
    var translateIntoJson = (arrToFile) => {
        if (arrToFile.length !== 0) {
            let jhElectronicaProductObject = {
                Products: arrToFile
            };
            fs.writeFile(
                "./scrapedData.json",
                JSON.stringify(jhElectronicaProductObject, null, 2),
                (err) => {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log("file successfully created");
                    }
                }
            );
        } else {
            console.log("Action impossible due to lack of information");
        }
    };
    translateIntoJson(results);
};
//does the scrapeJHElectronica function, and sends those results in a query to the standard products table. 
//Also runs asyncrunner to make sure we update our list of products since we delete the previous ones when we send new ones.
async function scrapeJHElectronicaToDatabase() {
    console.log("Scraping and uploading results to the database.");
    await sendMultipleProducts(await scrapeJHElectronica(), tableName1);
    console.log("Successfully uploaded all scraped Products to the database.");
}

//Made just to have an async handler, for when a get request is sent to /api.
//checks whether there is scrapeddata (which is standard products), and gets new products from the database if there isn't
//also in a definitely way more messy way than it should, checks and sets scrapedDataVar (variations) from the database if there aren't any.
async function asyncRunner() {
    if (!scrapedData || scrapedData.length == 0) {
        //sets scrapedData to be an array of all the products in the database.
        //Additionally, scrapedDataShort is the same as scrapedData, but without Price and ProductLink (since the client doesn't need to show these)
        scrapedData = await getAllProducts(tableName1);
        if (scrapedData || scrapedData != null) {
            await getOneCurrToDKK("USD").then(async (money) => {
                scrapedDataShort = scrapedData.map(({ ProductLink, Confidence, TechnicalSpecifications, ...remainingAttrs }) => remainingAttrs);
                for (let i = 0; i < scrapedData.length; i++) {
                    scrapedDataShort[i].Price = formatter(scrapedDataShort[i].Price.slice(1) * money);
                }
                scrapedDataVar = await getAllProducts(tableName2);
                if (scrapedDataVar || scrapedDataVar != null) {
                    getOneCurrToDKK("USD").then((money) => {
                        for (let i = 0; i < scrapedDataVar.length; i++) {
                            scrapedDataVar[i].Price = formatter(scrapedDataVar[i].Price.slice(1) * money);
                        }
                    });
                }
            });
        }
    } 
    if (!scrapedDataVar || scrapedDataVar.length == 0) {
        scrapedDataVar = await getAllProducts(tableName2);
        if (scrapedDataVar || scrapedDataVar != null) {
            getOneCurrToDKK("USD").then((money) => {
            for (let i = 0; i < scrapedDataVar.length; i++) {
                scrapedDataVar[i].Price = money;
                }
            });
        }
    }
}

//Calls the function to check whether the product has variations, and then scrapes all relevant variation data.
//returns either an array containing the different relevant values: [ProductIndex], [Price], [Name], or returns null if no variations are found.
//Also checks for and downloads pictures whether there are variations for the product or not, and saves the description for the products also.
async function doVariationScrape(obj) {
    return unirest
        .get(`${obj.ProductLink}`)
        .headers({
            UserAgent: `${user_agent}`
        })
        .then(async (response) => {
            var allMatches = [];
            //Occasionally, when too many requests are sent, the response is returned as nothing, so we just try again if that happens.
            if (typeof response.body == "undefined") {
                //console.log("Received empty body. Retrying...");
                return doVariationScrape(obj);
            }
            var $ = cheerio.load(response.body);
            var entireDataBlock = $('div[class="infos baf pt25 pb35 pl25 pr25"]').find('script[type="text/javascript"]')
                .text();

            pictureDownload($, obj.ProductIndex);

            var desc = await descriptionFinder($);
            //var sku = await skuFinder($);

            allMatches.push(desc);
            //allMatches.push(sku);
            //looks for prices and matches with regex to determine whether there are.
            if (variationFinder(entireDataBlock)) {
                var pricematches = entireDataBlock.match(/(?<=price: )[^,]+/g);
                pricematches.forEach((item, ind) => {
                    item = "$" + item;
                    if (item == "$0.00") {
                        item = "$0.01";
                    }
                    pricematches[ind] = item;
                });
                
                allMatches.push(pricematches);
                allMatches.push(nameFinder($));
            }
            return allMatches;
        });
}

//Finds the description, and handles it in one of two ways. Either takes everything up until package type / package include is encountered.
//Or if that returns nothing, matches every thing after package included up until we dont support online payment using regex.
//does not handle pictures at all, not even if there are pictures in the description.
async function descriptionFinder(cheerio) {
    let arr = [];
    let description;
    try {
        description = "";
        /*
        description = cheerio('div[class="li25 mt20"]').text().replace(/\s+/g, " ")
            .replace(/\'/g, "\'\'").match(/.*(?=package type|package include:)/i);
        if (description === null) {
            description = cheerio('div[class="li25 mt20"]').html().replace(/\s+/g, " ")
                .replace(/\'/g, "\'\'").match(/package include.*(?=(?:We don''t support online payment.|$))/i);
        }
        description = description[0].trim();
        if (description.length > 2200)
        {
            description = description.substring(0, 2199);
        }
        */

    }
    catch (err) {
        description = "";
    }
    arr.push(description);

    arr.push(skuFinder(cheerio));

    return arr;
}

//Finds and returns the sku number.
async function skuFinder(cheerio) {
    let sku;
    try {
        let productInfo = [...cheerio('[class="item1"]').find('div[class="row li25 mt20 mb20"]')].map(e =>
            [...cheerio(e).find(".lg-6")].map(e => cheerio(e).text().trim().replace(/\'/g, "\'\'"))
        );
        sku = productInfo[0][0].replace("SKU : ", "").replace("SKU: ", "");
    }
    catch (err) {
        sku = "";
    }
    return sku;
}

//Downloads the pictures based on their url. There are two different, one for handling pictures that are the main picture or in the left viewer on an individual products page on jhelectronica
//and another way to download the pictures scraped in the variations window on the right side.
async function pictureDownload(cheerio, productIndex) {
    let pictures = cheerio('ul[class="t-slider sliders fr sm-12"] > li').map(function () {
        return encodeURI(cheerio(this).find('img').attr("src"));
    }).toArray();
    let pictures2 = cheerio('[class="goodsspectable mb20"]').find('img').map(function () {
        return encodeURI(cheerio(this).attr("src"));
    }).toArray();

    var base = "https://www.jh-electronica.com";

    //pictures = [...new Set(pictures)];
    await pictures;
    await pictures2;

    for (var i = 0; i < pictures.length; i++) {
        await download(pictures[i].startsWith(base) ? pictures[i] : base + pictures[i], "./imgWithWatermarks/" + productIndex + "_" + i + pictures[i].slice(pictures[i].lastIndexOf(".")));
    }
    for (var j = 0; j < pictures2.length; j++) {

        await download(pictures2[j].startsWith(base) ? pictures2[j] : base + pictures2[j], "./imgWithWatermarks/" + productIndex + "-" + j + pictures2[j].slice(pictures2[j].lastIndexOf(".")));
    }
}
//Delegater of dovariationscrape, that makes it do the scraping and then sets descriptions only.
async function variationScraper(objectArray) {
    let amountOfObjectsSentAtATime = 6;
    let finalResults = [];
    let descriptionResults = [];
    while (objectArray.length > 0) {
        var smallerArray = [];
        if (objectArray.length > amountOfObjectsSentAtATime) {
            smallerArray = await objectArray.slice(0, amountOfObjectsSentAtATime);
            objectArray = await objectArray.slice(amountOfObjectsSentAtATime);
        } else {
            smallerArray = await objectArray;
            objectArray = [];
        }
        
        await Promise.all(smallerArray.map(async (obj) => {
            //console.log("work through: " + obj.ProductLink);
            let timeoutTimeMs = 30000;
            //console.log("Waiting for result for product with index: " + obj.ProductIndex);
            //breaker is a variable used to break the for loop. I couldn't break it inside the .then for the promise, so I had to delegate it like this, even if it does look a little silly.
            let breaker = false;
            for (i = 0; i < 5 * 6; i++) {
                let result = new Promise((resolve) => {
                    resolve(doVariationScrape(obj));
                });
                //I needed a variable that wasn't false, because doVariationScrape returns false when a variation isn't found for the specified product.
                //also it couldn't be true either, as the variable returns true if it is anything not null or false. I chose 1 because... Well, because I did.
                let timeout = new Promise((resolve, reject) => {
                    setTimeout(resolve, timeoutTimeMs, 1);
                });
                //race the promise that we know will complete in timeoutTimeMs and the promise that scrapes. If timeout wins, we just try scraping the same page again by letting the loop continue, otherwise break out of.
                await Promise.race([result, timeout]).then((data) => {
                    if (data != 1) {
                        //descriptions were a later addition so I had to do a little hack to safely extract them.
                        let array = [];
                        //let arraysku = [];
                        SKUAndDescriptionArr = data.splice(0, 1)[0];

                        //console.log(SKUAndDescriptionArr);

                        array.push(obj.ProductIndex, SKUAndDescriptionArr);
                        //arraysku.push(obj.ProductIndex, data.splice(0, 1)[0]);
                        descriptionResults.push(array);
                        //skuResults.push(arraysku);
                        //console.log(data);
                        if (data && data.length != 0) {
                            console.log("Variations found for product with index: " + obj.ProductIndex);
                            data.unshift(obj.ProductIndex);
                            finalResults.push(data);
                        } else {
                            console.log("Variations not found for product with index: " + obj.ProductIndex);
                        }
                        breaker = true;
                    } else {
                        console.log(`Timeout triggered for ${obj.ProductIndex} after ${timeoutTimeMs}MS. Trying again.`);
                        //console.log(`Timeout triggered at try ${i%6+1} for ${obj.ProductIndex} after ${timeoutTimeMs}MS. Trying again.`);
                    }
                });
                if (breaker) {
                    break;
                }
            }
        }));
        //await new Promise((resolve) => {
            //console.log("He's sleeping, dude.");
            //setTimeout(resolve, 2000);
        //});
    }
    await setDescriptions(descriptionResults);
    return finalResults;
}

//Finds the name for the variations. Since some variations are segmented into two, e.g. color and voltage, I combine them in a way that every color is available for every voltage.
//instead of saving red, blue, 20v, 30v, we save (red) 20v, (red) 30v, (blue) 20v, (blue) 30v. To determine what goes in the parenthesis, I take the segment with the least amount of variations.
function nameFinder(cheerio) {
    let diffRows = cheerio('[class="goodsspectable mb20"]');
    var n = 0;
    let nameBefore = [...diffRows.find('ul[class="row tac"]')].map(e =>
        [...cheerio(e).find("li")].map(e => cheerio(e).find('img').attr("title")
            ? cheerio(e).find('img').attr("title").trim().replace(/\'/g, "\'\'") + ` img:${n++}`
            : cheerio(e).find('img').attr("src") ? cheerio(e).text().trim().replace(/\'/g, "\'\'") + ` img:${n++}` :
                cheerio(e).text().trim().replace(/\'/g, "\'\'"))
    );


    var styleNames = [...diffRows.find('div[class="pt20 pb10"]')].map(e =>
        cheerio(e).text().trim().replace(/\"/g, '\"\"')
            .replace(/\'/g, "\'\'").replace(String.fromCharCode(65306), ':'));
    
    //.replace(/\U+FF1A/g, ":")
    //console.log(styleNames);
    //console.log(nameBefore);

    var arr = [];
    arr.push('');
    arr.push('()');
    arr.push('[]');
    arr.push('{}');
    arr.push('||');
    //console.log(cheerio('div[class="infos baf pt25 pb35 pl25 pr25"]').find('script[type="text/javascript"]').text());
    var dataAndKeys = cheerio('div[class="infos baf pt25 pb35 pl25 pr25"]').find('script[type="text/javascript"]')
        .text().match(/(?=var keys).*/gms);
    //console.log("dataAndKeys is: ", dataAndKeys);
    var dataValues = dataAndKeys[0].match(/(?<=")([\d]{5}(?:;[\d]{5})*)/gm);
    //console.log("This is the dataValues: ", dataValues);
    var keyValuesObt = dataAndKeys[0].match(/\[.*?\]/gms);
    var keyValues = [];
    let notInStockVariations = [];
    for (i = 0; i < keyValuesObt.length; i++) {
        keyValues.push(keyValuesObt[i].match(/(?<=(?:\[|,)').*?(?=')/gm));
    }
    //console.log("This is the keyValues: ", keyValues);

    var number = keyValues[0].length;
    //console.log("number is: ", number);
    for (i = 1; i < keyValues.length; i++)
    {
        //Make sure this works with length = 1.
        number *= keyValues[i].length;
    }
    if (number != dataValues.length)
    {
        let arr = [];
        for (i = keyValues.length - 1; i > 0; i--) {
            arr.push(keyValues[i - 1].flatMap(d => keyValues[i].map(v => d + ';' + v)));
            keyValues.splice(i);
        }
        //console.log("Hi im printing");
        for (i = 0, j = 0; i < arr[0].length; i++, j++)
        {
            //console.log("We have entered \"The Loop\"");
            //console.log(i, j);
            //console.log(arr[0][i]);
            //console.log(dataValues[j]);
            if (arr[0][i] != dataValues[j])
            {
                notInStockVariations.push(i);
                j--;
            }
        } 
        //console.log(notInStockVariations);
        //console.log("SCORN: ", arr);
    }

    /*
    nameBefore.sort((a, b) => b.length - a.length);
    for (i = 0; i < nameBefore.length; i++) {
        for (j = 0; j < nameBefore[i].length; j++) {
            nameBefore[i][j] = arr[i % arr.length].charAt(0) + nameBefore[i][j] + arr[i % arr.length].charAt(1);
        }
    }
    
    for (i = nameBefore.length - 1; i > 0; i--) {
        nameBefore[i - 1] = nameBefore[i].flatMap(d => nameBefore[i - 1].map(v => d + ' ' + v));
        nameBefore.splice(i);
    }

    for (i = 0; i < notInStockVariations.length; i++)
    {
        nameBefore[0].splice(notInStockVariations[i], 1);
    }
    */
    var results = [];
    results.push(styleNames);
    results.push(nameBefore);
    results.push(notInStockVariations);
    console.log(results);
    return results;
}

//Determines whether the provided dataBlock contains variations based on whether there are "keys", id's for variations.
function variationFinder(dataBlock) {
    let keysmatches = dataBlock.match(/(?<=keys = \[)[^\]]+\]/g);
    if (keysmatches) {
        return true;
    }
    return false;
}
//Function to retrieve just ProductIndex and ProductLink for each entry in the database. Used for finding variations, and properly "binding" the variations to the original entry based on productindex.
async function getIndexAndProductLink() {
    try {
        let pool = await sql.connect(config);
        let result1 = await pool.request().query(`select ProductIndex, ProductLink from ${tableName1}`);
        sql.close();
        var array = [];
        for (var key in result1.recordset) {
            if (result1.recordset.hasOwnProperty(key)) {
                var item = result1.recordset[key];
                array.push({
                    ProductIndex: item.ProductIndex,
                    ProductLink: item.ProductLink
                });
            }
        }
        //console.log(`Found following amount of products: ${array.length}`);
        return array;
    } catch (error) {
        console.log(error);
        sql.close();
        return null;
    }
}

//This function calls the function to get all indexes and productlinks, and uses those to scrape those products for variations, and then returns the result.
async function variationGetter() {

    let allIndexandProdLinks = await getIndexAndProductLink();

    let obtainVariationsData = await variationScraper(allIndexandProdLinks);

    return obtainVariationsData;
}

//Get the price specifically for Shopify, this means getting two values, one for before profits and one for after, and also calculating taxes and other price hikes.
async function GetShopifyPrice(currency, tableName) {
    return new Promise(async (resolve, reject) => {
        var promises = [];
        //var price = await getAllX(tableName, 'Price');
        var price;
        if (tableName == tableName1) {
            price = scrapedData;
        } else {
            try {
                let pool = await sql.connect(config);
                let result1 = await pool.request().query(`select ProductIndex, Price from ${tableName2}`);
                sql.close();
                price = result1.recordset;
            } catch (error) {
                sql.close();
                return reject("Failed to retrieve prices.");
            }
        }
        price.forEach((prod) => {
            var result = new Promise((resolve) => {
                py.import("/Calculatorify.py").then(async function(pymodule) {
                    let win = await py.callSync(pymodule, "mainer", Number(prod.Price.slice(1)), 1, currency);
                    resolve({ ProductIndex: prod.ProductIndex, Price: win.toString().split(',') });
                });
                /*
                pythSpawner(prod.Price.slice(1), 1, currency, "Calculatorify.py").then((res) => {
                    var arr = res.split(`|`);
                    for (i = 0; i < arr.length; i++) {
                        arr[i] = arr[i].replace(`\r`, '').replace(`\n`, '').trim();
                    }
                    resolve({ ProductIndex: prod.ProductIndex, Price: arr });
                });
                */
            });
            promises.push(result);
        });
        resolve(await Promise.all(promises));
    });
}

//A function, that makes a .csv file in the same folder the program is running, with the .csv file containing all the necessary values we would need to import our data straight to Shopify from our databases two tables.
//We make sure to validate what pictures we have, because of Shopify. There is a certain bug in Shopify, that makes it not upload a product if any of the pictures for that product is invalid, BUT
//ONLY IF the product doesn't already exist in the catalogue. If it does and you are updating it with an image that doesnt exist, it works fine, just doesnt have that picture. This took me a really long time to figure out.
//Long story short: If you upload the CSV this function creates, and it says successfully uploaded, but no products are found where you would expect them to be, Shopify likely cant reach the images at the place the .csv files suggests they are.
async function CreateCSV() {
    return new Promise(async (resolve, reject) => {
        var shopifyPrices = GetShopifyPrice("USD", tableName1).then(result => shopifyPrices = result);
        var shopifyPricesVar = GetShopifyPrice("USD", tableName2).then(res => shopifyPricesVar = res);
        var collection = "Drop shipping";
        var status = "draft";
        var baseUrl = process.env.FILESERVER;
        var lines = [];
        lines.push("Handle,Title,Body (HTML),Collection,Option1 Name,Image Src,Price,Cost per item,Option1 Value,Variant Image,Status,Variant SKU");

        

        try {
            await shopifyPrices;
            await shopifyPricesVar;
        } catch (e) {
            return resolve(console.log("Error: " + e));
        }


        await fs.readdir(path.join(__dirname, 'public', 'img'),
        function(err, images) {
            if (err) {
                reject(console.log(err));
            }
            for (i = 0; i < scrapedData.length; i++) {
                var pictures = images.filter(img => img.startsWith(`${scrapedData[i].ProductIndex}-`));
                var variations = scrapedDataVar.filter(varia => varia.ProductIndex === scrapedData[i].ProductIndex);
                let varShopifyPricesSpecific = shopifyPricesVar.filter(varia => varia.ProductIndex === scrapedData[i].ProductIndex);
                lines.push(`${scrapedData[i].ProductIndex},\"${scrapedData[i].ProductName.replace(/\"/g, "'")}\",\"${scrapedData[i].Description.replace(/\"/g, "'").replace(/(\r\n|\r|\n)/g, '<br>') + (scrapedData[i].TechnicalSpecifications ? scrapedData[i].TechnicalSpecifications.replace(/\"/g, "'").replace(/(\r\n|\r|\n)/g, '<br>') + "<br>" : "") + reservations + guarantee.replace(/\"/g, "'").replace(/(\r\n|\r|\n)/g, '<br>')}\",${collection},"Title",,${variations.length > 0 ? "," : `${formatter(shopifyPrices[i].Price[1])},${formatter(shopifyPrices[i].Price[0])}`},,,${status},${variations.length > 0 ? "" : `${scrapedData[i].SKU}`}`);
                var _pictures = images.filter(img => img.startsWith(`${scrapedData[i].ProductIndex}_`));
                for (x = 0; x < _pictures.length; x++) {
                    lines.push(`${scrapedData[i].ProductIndex},,,,,${baseUrl + "Outsource" + _pictures[x].replace("Outsource", "")},,,,,,`);
                }

                
                
                /*
                if (pictures.length < variations.length && pictures.length != 0) {
                    let numb = variations.length / pictures.length;
                    let arr = [];
                    for (k = 0; k < pictures.length; k++) {
                        for (j = 0; j < numb; j++) {
                            arr.push(pictures[numb > pictures.length ? j : k]);
                        }
                    }
                    pictures = arr;
                }
                */
                //This looks menacing, but it just duplicates entries in pictures until its length is the same as variations.
                //Although it dupes them in a very specific way to make sure the images line up with the variations "to the best of my abilities".
                if (pictures.length < variations.length && pictures.length != 0) {
                    let numb = variations.length / pictures.length;
                    let arr = [];
                    if (numb > pictures.length) {
                        for (k = 0; k < pictures.length; k++) {
                            for (j = 0; j < numb; j++) {
                                arr.push(pictures[k]);
                            }
                        }
                    }
                    else {
                        for (k = 0; k < numb; k++) {
                            for (j = 0; j < pictures.length; j++) {
                                arr.push(pictures[j]);
                            }
                        }
                    }
                    pictures = arr;
                }

                for (var l = 0; l < variations.length; l++) {
                    lines.push(`${scrapedData[i].ProductIndex},,,,,,${formatter(varShopifyPricesSpecific[l].Price[1])},${formatter(varShopifyPricesSpecific[l].Price[0])},\"${variations[l].ProductName.replace(/\"/g, "'")}\",${pictures[l] ? baseUrl + "Outsource" + pictures[l] : ""},,${scrapedData[i].SKU}`);
                };

            };
            resolve(csvFileCreator(lines));
        });
    });
}

//Creates a .csv file, with its values being whatever is in the array.
async function csvFileCreator(objArray) {
    return new Promise(async (resolve) => {
        var file = fs.createWriteStream('ToShopify.csv');
        file.on('error', function (err) { console.log(err) });
        await objArray.forEach((line) => {
            file.write(line + `\n`);
        });
        file.end();
        resolve(objArray);
    });
}

//gets all the variations from the above function, and saves those in the database table specified. Also times this action because it takes a long time and I thought it was funny.
//asyncRunner gets database entries again, if the held arrays in this program are zero (which they are set to when we change the databases).
async function GetandSetDatabaseVariation() {
    console.time('GetAndSetDatabaseVariation Completed in');
    let variationData = await variationGetter();

    await sendMultipleProducts(variationData, tableName2).then(() => {
        console.log("Sent following amount of products, that have variations: " + variationData.length);
        console.timeEnd('GetAndSetDatabaseVariation Completed in');
    });
}
//Function to receive a post request at / pyth and spawn a python object, that based on Calculator.py returns some kind of data, that we then send back to the user connecting.
//If Product received without VariationID for Product with no variations, return the Price for that Product.
//If Product and VariationID received for Product with variations, return that variations Price.
//If Product received without VariationID for Product with variations, return an array of Prices containing all the variations prices for that Product.
async function pythonPoster(req) {
    return new Promise(async (resolve) => {
    try {
        let obj = scrapedDataVar.filter(prodVar => prodVar.ProductIndex === Number(req.body.ProductIndex));
        var price;
        if (obj.length > 0) {
            if (req.body.VariationID) {
                price = await Number(obj[Number(req.body.VariationID) - 1].Price.slice(1));
                resolve(pythSpawner(Number(price), Number(req.body.Amount), "USD", "Calculator.py"));
            } else {
                var arr = [];
                await Promise.all(obj.map(async(promise) => {
                    arr.push(await pythSpawner(Number(promise.Price.slice(1)), Number(req.body.Amount), "USD", "Calculator.py"));
                }));
                resolve(arr);
            }
        } else {
            price = await Number(scrapedData[Number(req.body.ProductIndex) - 1].Price.slice(1));
            pythSpawner(price, Number(req.body.Amount), "USD", "Calculator.py").then((dkkPrice) => {
                resolve(dkkPrice);
            });
        }
    } catch (err) {
        console.log(err);
        resolve("?");
        }
    });
}

//Making the API request/response
app.get("/api", (req, res) => {
    asyncRunner().then(() => {
		res.json(scrapedDataShort);
	});
});

//post a request with a ProductIndex in the body, and retrieve the variations that corresponds to that Product.
app.post("/apivar", (req, res) => {
    asyncRunner().then(() => {
		if (!isNaN(req.body.ProductIndex) && req.body.ProductIndex != 0) {
        res.json(getSpecificProductByID(req, tableName2));
		} else {
			res.json("?");
		}
	});
});

//post a request to /pyth, relegates anything done to the function pythonPoster.
/*
app.post("/pyth", (req, res) => {
  asyncRunner().then(() => {
      pythonPoster(req).then((result) => {
          res.send(result);
      });
  });
});
*/

//App post mailer
//Getting the data from the client side
app.post("/mailer", (req, res, next) => {
    const email = req.body.emailAddress;

    //Declaring a transporter
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: 2525,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    //Declaring the options for the transporter. (where to send the email, from who, subject and body of the email)
    const options = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Test",
        text: "Just a test email sent from node module! This mail was sent automatically"
    };

    //Sending the email
    transporter.sendMail(options, (err, info) => {
        if (err) {
            console.log(err);
            res.status(500).send("Error sending mail");
        } else {
            console.log("Email sent" + info.response);
            res.send("email sent");
        }
    });
});

app.listen(5000, () => {
    console.log("server started on port 5000");
});



//Function that runs both scrapeJHElectronicaToDatabase, and then uses the newly set database values to run GetandSetDatabaseVariation
function doBoth() {
    return new Promise((resolve, reject) => {
        scrapeJHElectronicaToDatabase().then(() => {
            GetandSetDatabaseVariation().then(() => {
                resolve();
            });
        });
    });
}

//This readline interface can be used after connecting to the session (using docker attach if in a container) to make the program run some functions, that are useful to run every now and then
//but not neccessary to have on a timer.
function innerQuestion() {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false});
    rl.setPrompt("Input command, or ? for a list of commands.\n");
    rl.prompt();
    rl.on('line', (query) => {
        var que = query.trim();
        var quer = que.toLowerCase().split(' ');
        rl.pause();
        switch (quer[0].toString()) {
            case "doboth":
                console.log(
                    "This function will scrape for everything, set both standard and variations tables, download images...");
                rl.question('Are you sure this is what you want? It\'s gonna take a monstrous amount of time. \'y\' for yes, send any other key to abort.',
                    (answer) => {
                        switch (answer.trim().toLowerCase()) {
                            case "y":
                                rl.pause();
                                doBoth().then(() => {
                                    console.log("Finished.");
                                    rl.resume();
                                    rl.prompt();
                                });
                                break;
                            default:
                                console.log("Aborted");
                                rl.resume();
                                rl.prompt();
                        }
                    });
                break;
            case "scrapejhtodb":
                console.log("Starting Scrape + DB Upload.");
                scrapeJHElectronicaToDatabase().then(() => {
                    rl.resume();
                    rl.prompt();
                });
                break;
            case "scrapejhvariationstodb":
                console.log("Starting scraping variations + DB Upload + img download, this is gonna take a bit.");
                GetandSetDatabaseVariation().then(() => {
                    rl.resume();
                    rl.prompt();
                });
                break;
            case "createcsv":
                console.log("Creating .csv file...");
                CreateCSV().then(() => {
                    console.log("Finished.");
                    rl.resume();
                    rl.prompt();
                });
                break;
            case "watermarkremover":
                console.log("Trying out the WatermarkRemover...");
                pythWaterMarkSpawner().then(() => {
                    rl.resume();
                    rl.prompt();
                });
                break;
            case "generateandsetdescriptions":
                if (quer.length > 1 &&
                    !isNaN(quer[1].toString())) {
                    GenerateAndSetDescription(Number(quer[1].toString())).then(() => {
                        rl.resume();
                        rl.prompt();
                    });
                } else {
                    GenerateAndSetDescription().then(() => {
                        rl.resume();
                        rl.prompt();
                    });
                }
                break;
            case "generateforproduct":
                if (quer.length > 1) {
                    var q = que.split(' ');
                    let extra = q.slice(1);
                    GenerateForProduct(extra.join(' ').trim()).then((result) => {
                        for (i = 0; i < result.length; i++) {
                            result[i].replace("''", "'");
                        }
                        console.log(result);
                        rl.resume();
                        rl.prompt();
                    });
                }
                break;
            case "setdescriptionsfromjson":
                try {
                    console.log("trying to set descriptions from json");
                    SetDescriptionFromJSON();
                    rl.resume();
                    rl.prompt();
                }
                catch (e)
                {
                    console.log(e);
                    rl.resume();
                    rl.prompt();
                }
            case "?":
                console.log("Current options are: scrapeJHtoDB, \nscrapeJHVariationstoDB, \ndoBoth, \nCreateCSV, \nWatermarkRemover, \nGenerateAndSetDescriptions in which you can input a number after GenerateAndSetDescriptions to only use the function on those Products. (from the first product, until the specified number) and \ngenerateforproduct, which you need to follow up with the name of the product you would want a ChatGPT generated description for.");
                rl.resume();
                rl.prompt();
                break;
            default:
                console.log("Input not recognized. Try '?' for a list of commands.");
                rl.resume();
                rl.prompt();
        }
    });
}
//We make sure the program gets the database through asyncrunner, and only after do we run InnerQuestion.
//asyncRunner().then(() => {
//    innerQuestion();
//});

//SetDescriptionFromJSON();
// use this V if you want to scrape new data and save it to a Json file:
//scrapeJHElectronicaToJSON();

// use this V if you want to upload the current Json File found in the same folder. WARNING: Will delete current records.
//UploadJsonFile();

//Test Functions VV
/*
doVariationScrape({ ProductIndex: 3, ProductName: "Triple Variation Group?", ProductLink: "https://www.jh-electronica.com/220v-my2nj-my4nj-ly2nj-my2n-gs-my4n-gs-small-electromagnetic-relay.shtml"}).then(
    (res) => {
        console.log(res);
    });
    */
scrapedData.push({ ProductIndex: 1, ProductName: "The Tick", ProductLink: "https://www.jh-electronica.com/mq-series-gas-detection-module-mq-2mq-3mq-4mq-5mq-6mq-7mq-8mq-9mq-135.shtml" });
//scrapedData.push({ ProductIndex: 2, ProductName: "Double Variation Group?", ProductLink: "https://www.jh-electronica.com/06609109613154242-inch-white-yellow-blue-two-color-oled-lcd.shtml" });
sendMultipleProducts(variationScraper(scrapedData), tableName2);
/*
doVariationScrape({ ProductIndex: 2, ProductName: "Double Variation Group?", ProductLink: "https://www.jh-electronica.com/06609109613154242-inch-white-yellow-blue-two-color-oled-lcd.shtml" }).then(
    (res) => {
        console.log(res);
    });
*/
/*
doVariationScrape({ ProductIndex: 1, ProductName: "Single Variation Group?", ProductLink: "https://www.jh-electronica.com/uno-r3-atmega328p-development-board.shtml" }).then(
    (res) => {
        console.log(res);
    });
    */
//innerQuestion();
/*
scrapedData.push({
    ProductIndex: 1002,
    ProductName: `2SC1815 HF SOT-23 NPN SMD Triode`,
    Description: "<b> LIVIN' HIGH ON THE HOG REEEE </b>Introducing the 2sc1815,hf,sot-23,npn,smd,triode - the ultimate transistor that''s not just any ordinary transistor.\n" +
        '\n' +
        "Looking for a transistor with a bit more pizzazz? Look no further than the 2sc1815,hf,sot-23,npn,smd,triode. This little guy might sound like a complicated science experiment, but trust us, it''s much more exciting than that.\n" +
        '\n' +
        "Picture this: you''re in the middle of a project and suddenly your run-of-the-mill transistor just isn''t cutting it. You need something that''s going to stand out, something that''s going to make all the other transistors cower in fear. That''s where the 2sc1815,hf,sot-23,npn,smd,triode comes in.\n" +
        '\n' +
        "With its sleek design and impressive triode functionality, the 2sc1815,hf,sot-23,npn,smd,triode is like the James Bond of transistors. It''s smooth, it''s suave, and it''s got all the right moves. Plus, its SMD and NPN capabilities mean it''s ready to take on any project that comes its way.\n" +
        '\n' +
        "Let''s be real - your projects deserve the very best. And with the 2sc1815,hf,sot-23,npn,smd,triode, you''re not just settling for good enough. No, you''re getting a transistor that''s going to take your projects to the next level. So go ahead, give the ordinary transistors the boot and incorporate the 2sc1815,hf,sot-23,npn,smd,triode into your work. Your projects will thank you.",
    Price: "$2.0",
    Confidence: "The information for the technical specification sheet was obtained from the manufacturer''s website.",
    TechnicalSpecifications: '<header>Technical Specifications</header>\n' +
        '\n' +
        '<table>\n' +
        '  <tbody>\n' +
        '    <tr>\n' +
        '      <td>Product Name</td>\n' +
        '      <td>2SC1815,HF,SOT-23,NPN,SMD,Triode</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Package Type</td>\n' +
        '      <td>SOT-23</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Transistor Type</td>\n' +
        '      <td>NPN</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Voltage Rating</td>\n' +
        '      <td>50V</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Current Rating</td>\n' +
        '      <td>150mA</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Power Dissipation</td>\n' +
        '      <td>225mW</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Frequency</td>\n' +
        '      <td>625 MHz</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Gain</td>\n' +
        '      <td>40 dB</td>\n' +
        '    </tr>\n' +
        '    <tr>\n' +
        '      <td>Dimensions</td>\n' +
        '      <td>2.9 x 1.3 x 1.3mm</td>\n' +
        '    </tr>\n' +
        '  </tbody>\n' +
        '</table>\n' +
        '\n',
    SKU: 4091
});
scrapedData.push({
    ProductIndex: 1003,
    ProductName: `TTGO T-Display S3 ESP32-S3 with WiFi, Bluetooth and 1.9" color LCD screen`,
    Description: `THIS PIGGY IS GOING TO MARKET!`,
    Price: "$5.0",
    Confidence: "No.",
    TechnicalSpecifications: "Hello, hi, I'm a 2019 guy, I, don't really go outside! I am offended online.",
    SKU: 4091
});
*/
/*
var descriptionArr = [];
descriptionArr.push("This is a description");
descriptionArr.push("This is SKU");
var product = [];
product.push(1004);
product.push(descriptionArr);
scrapedData.push(product);
//setDescriptions(scrapedData);
*/

/*
scrapedData.push({
    ProductIndex: 1,
    ProductName: `DC3 1.27mm 2*6/8/10/14/16/20/26/30/40/50P Simple Horn Socket`,
    ProductLink: "https://www.jh-electronica.com/uno-r3-atmega328p-development-board.shtml"
});
scrapedData.push({
    ProductIndex: 2,
    ProductName: `3*40P 2.54mm Three-rows Gold-plated Female Socket`,
    ProductLink: "https://www.jh-electronica.com/nano-v30-atmega328p-development-board-no-welding-without-cable.shtml"
});
doVariationScrape(scrapedData[1]).then((result) => {
    var arr = [];
    var extraarr = [];
    arr.push(2);
    arr.push(result[1]);
    extraarr.push(arr);
    setSKU(extraarr);
    console.log(result);
});
*/
/*
scrapedData.push({
    ProductIndex: 1,
    ProductName: `5P PJ-317 Double Channel Audio Socket`
});
scrapedData.push({
    ProductIndex: 7,
    ProductName: `12*12*7.3mm B3F-4055 OMRON 4Pin DIP Micro Touch Switch and Cap`
});
scrapedData.push({
    ProductIndex: 8,
    ProductName: `DB9 RS232 Female/Male Connector with Fixed Screw`
});
scrapedData.push({
    ProductIndex: 9,
    ProductName: `0912 1mH/4.7/10/22/33/47UH 9*12mm I-shaped Inductor`
});

scrapedData.push({
    ProductIndex: 10,
    ProductName: `DVI 24+5P 90-degree Female Connector For Monitor`
});
scrapedData.push({
    ProductIndex: 11,
    ProductName: `3Pin Dial Wheel Switch`
});
*/

/*
scrapedDataVar.push({
    ProductIndex: 1002,
    VariationID: 1,
    ProductName: `3Pin Dial Wheel Switch`,
    Price: "$0.1"
});
scrapedDataVar.push({
    ProductIndex: 1002,
    VariationID: 2,
    ProductName: `DVI 24+5P 90-degree Female Connector For Monitor`,
    Price: "$0.2"
});
scrapedDataVar.push({
    ProductIndex: 1002,
    VariationID: 3,
    ProductName: `0912 1mH/4.7/10/22/33/47UH 9*12mm I-shaped Inductor`,
    Price: "$0.4"
});
scrapedDataVar.push({
    ProductIndex: 1003,
    VariationID: 1,
    ProductName: `DB9 RS232 Female/Male Connector with Fixed Screw`,
    Price: "$0.7"
});
*/
//CreateCSV();
/*
var objArray = [];
objArray.push([1, "<b>Get ready to take your electronics projects to the next level with the UNO R3 Atmega328p Development Board!</b>\n <p>\n Introducing the UNO R3 Atmega328p Development Board, the ultimate weapon of choice for nerds and geeks with an insatiable appetite for tinkering with electronics. Let this bad boy be the gateway to your wildest DIY project dreams!\n <br><br>\n Featuring the powerful Atmega328p chip, this board gives you the horsepower you need to run your code like a champion. With its sleek design and easy-to-use interface, you''ll be up and running in no time.\n <br><br>\n So why settle for a boring, run-of-the-mill development board when you can have the UNO R3 Atmega328p? Not only does it have a name that sounds like a superhero, but it also has a limitless potential to bring your wildest electronic dreams to life.\n <br><br>\n Whether you''re building a robot, creating an arcade game, or making a traffic light system for your neighborhood, the UNO R3 Atmega328p is the perfect tool for the job. Who knows, maybe you''ll even become the next Tony Stark (minus the suit).\n <br><br>\n But don''t take our word for it, try the UNO R3 Atmega328p Development Board for yourself and see just how awesome it is.\n </p>", "Technical Specifications:\n \n - Microcontroller: ATmega328P\n - Operating Voltage: 5V\n - Input Voltage (recommended): 7-12V\n - Digital I/O Pins: 14 (of which 6 provide PWM output)\n - Analog Input Pins: 6\n - DC Current per I/O Pin: 20 mA\n - DC Current for 3.3V Pin: 50 mA\n - Flash Memory: 32 KB (ATmega328P) of which 0.5 KB used by bootloader\n - SRAM: 2 KB (ATmega328P)\n - EEPROM: 1 KB (ATmega328P)\n - Clock Speed: 16 MHz\n", "Yes."]);
setDescriptions(objArray).then((result) => {
    console.log(result);
});
*/
/*
var pictures = [];
var variations = [];
pictures.push("img1");
pictures.push("img2");
pictures.push("img3");
variations.push("(img1) var1");
variations.push("(img1) var2");
variations.push("(img1) var3");
variations.push("(img2) var1");
variations.push("(img2) var2");
variations.push("(img2) var3");
variations.push("(img3) var1");
variations.push("(img3) var2");
variations.push("(img3) var3");
*/
/*
pictures.push("img1");
pictures.push("img2");
pictures.push("img3");

variations.push("[outvar1] (img1) var1");
variations.push("[outvar1] (img1) var2");
variations.push("[outvar1] (img1) var3");
variations.push("[outvar1] (img1) var4");
variations.push("[outvar1] (img2) var1");
variations.push("[outvar1] (img2) var2");
variations.push("[outvar1] (img2) var3");
variations.push("[outvar1] (img2) var4");
variations.push("[outvar1] (img3) var1");
variations.push("[outvar1] (img3) var2");
variations.push("[outvar1] (img3) var3");
variations.push("[outvar1] (img3) var4");

variations.push("[outvar2] (img1) var1");
variations.push("[outvar2] (img1) var2");
variations.push("[outvar2] (img1) var3");
variations.push("[outvar2] (img1) var4");
variations.push("[outvar2] (img2) var1");
variations.push("[outvar2] (img2) var2");
variations.push("[outvar2] (img2) var3");
variations.push("[outvar2] (img2) var4");
variations.push("[outvar2] (img3) var1");
variations.push("[outvar2] (img3) var2");
variations.push("[outvar2] (img3) var3");
variations.push("[outvar2] (img3) var4");
*/
/*
pictures.push("Img1");
pictures.push("Img2");
pictures.push("Img3");
variations.push("(var1) img1");
variations.push("(var1) img2");
variations.push("(var1) img3");
variations.push("(var2) img1");
variations.push("(var2) img2");
variations.push("(var2) img3");
*/




/*
if (pictures.length < variations.length && pictures.length != 0) {
    let numb = variations.length / pictures.length;
    let arr = [];
    if (numb > pictures.length) {
        for (k = 0; k < pictures.length; k++) {
            for (j = 0; j < numb; j++) {
                arr.push(pictures[k]);
            }
        }
    }
    else {
        for (k = 0; k < numb; k++) {
            for (j = 0; j < pictures.length; j++) {
                arr.push(pictures[j]);
            }
        }
    }
    pictures = arr;
}

console.log(pictures);
*/