import sys
import datetime
from requests_cache import CachedSession
import json

ProfitMarginDec = 1.3
session = CachedSession(expire_after=datetime.timedelta(days=5))


#Uses a get request to grab exchange rates for DKK to any other coin, and adds 5% (1.05) for Conversion Fee.
#Data is obtained from https://theforexapi.com/, which (supposedly) updates daily at 3PM CET.
#Supports: USD, JPY, BGN, CZK, GBP, EUR, HUF, PLN, RON, SEK, CHF, ISK, NOK, TRY,
#AUD, BRL, CAD, CNY, HKD, IDR, INR, KRW, MXN, MYR, NZD, PHP, SGD, THB, ZAR. And ofc DKK, although DKK to DKK conversion is silly.
#Now features caching for 5 days (customizable at top).
def CurrencyConversion(ExchangeCurrency):
    try:
        response = session.get('https://theforexapi.com/api/latest?base=DKK')
        response_dict = json.loads(response.text)
        return (response_dict["rates"][ExchangeCurrency] / 1.05)
    except:
        return 0.13589177779909814

#Converts the PricePerItem from whichever Currency it originates from to DKK
def PriceInDKK(Price, CurrencyConversion):
    return Price/CurrencyConversion

def main(Price, Amount, Currency):
    PriceDKKWithProfits = PriceInDKK(Price, CurrencyConversion(Currency)) * ProfitMarginDec * Amount
    return PriceDKKWithProfits

print(main(float(sys.argv[1]), int(sys.argv[2]), sys.argv[3]))
#print(main(float(1.5), int(1), "USD"))


#sys.argv.append("1200")
#sys.argv.append("24")
#sys.argv.append("USD")
#sys.argv.append("True")
#sys.argv.append("True")
#sys.argv.append("2023-01-28")
#For test
#0,14552835692489682 = 687,15130242009980194369397741048
#0,1385984351665684 = 721,508867541104792040878676281


#Returns the cost of an Item based on it's native cost in it's native currency per Item.
#def PricePerItem(BasePrice, Amount):
#    return BasePrice/Amount

#Adds ImportTax on to the items price. 
#def DKKBuyPricePerWImportTaxes(PriceInDKK):
#    ImportTax = 1.05
#    return PriceInDKK*ImportTax

#Finds the ImportFee spread over each item.
#def ImportFee(Amount):
#    ImportFee = 160
#    return ImportFee/Amount

#TransactionFee is equal to the value of the item * 1.03, since 3% TransactionFee for purchases on Shopify.
#def TransactionFee(DKKBuyPricePerWImportTax):
#    TransactionFee = 1.03
#    return DKKBuyPricePerWImportTax * TransactionFee

#Adds ImportFee and TransactionFee together, where TransactionFee is equal to the value of the item * 1.03, since 3% TransactionFee.
#def DKKBuyPricePerWExpenses(ImportFee, TransactionFee):
#    return ImportFee+TransactionFee

#Multiply PricePerItem with however much Profit (in decimal) you want.
#def CalculatedSalesPrice(Price, Profit):
#    return Price*Profit

#Evaluates whether the string expression passed through is equal to "true", and sends a boolean set to true back if so. Anything else gets the boolean returned as False.
#def CheckTrueOrFalse(Boolean):
#    if(Boolean.lower() == "true"):
#        return True
#    return False

#def CalcOutsideEbitsInsideEU(TotalPriceBeforeCalc, Amount, ExchangeCurrencyStr):
#    PricePer = PricePerItem(TotalPriceBeforeCalc, Amount)
#    if(ExchangeCurrencyStr == "DKK"):
#        PriceDKK = PricePer
#    else:
#        PriceDKK = PriceInDKK(PricePer, CurrencyConversion(ExchangeCurrencyStr))
#    PriceInDKKWTransactionFee = TransactionFee(PriceDKK)
#    FullPricePerItem = CalculatedSalesPrice(PriceInDKKWTransactionFee, ProfitMarginDec)
#    return FullPricePerItem


#def CalcOutsideEbitsOutsideEU(TotalPriceBeforeCalc, Amount, ExchangeCurrencyStr):
#    PricePer = PricePerItem(TotalPriceBeforeCalc, Amount)
#    PriceDKK = PriceInDKK(PricePer, CurrencyConversion(ExchangeCurrencyStr))
#    PriceInDKKWImportTaxes = DKKBuyPricePerWImportTaxes(PriceDKK)
#    PriceInDKKWImportTaxesTransactionFee = TransactionFee(PriceInDKKWImportTaxes)
#    DKKBuyPricePerWExpense = DKKBuyPricePerWExpenses(ImportFee(Amount), PriceInDKKWImportTaxesTransactionFee)
#    FullPricePerItem = CalculatedSalesPrice(DKKBuyPricePerWExpense, ProfitMarginDec)
#    return FullPricePerItem

#The main driver of the app. First check for if the item is within Ebits stock removes VAT from the total price.
#def main(Price, Amount, Currency, OutsideEbits, OutsideEU, DeliveryDate):
#    Price *= Amount
#    if(OutsideEbits == False):
#        Calculation = Price * 0.8
#    elif(OutsideEbits == True and OutsideEU == True):
#        Calculation = CalcOutsideEbitsOutsideEU(Price, Amount, Currency)
#    elif(OutsideEbits == True and OutsideEU == False):
#        Calculation = CalcOutsideEbitsInsideEU(Price, Amount, Currency)
#    PotentialDiscounts = DiscountsAndPenalties(Calculation, Amount, DeliveryDate)
#    return PotentialDiscounts
    
#Calculates how much of a discount is applied based on how many of an item are bought. Buy 6 or more to get 1,5%, buy 9 or more to get 2,5% off the order.
#def DiscountsAndPenalties(Price, Amount, DeliveryDate):
#    AmountDiscountToApply = 1.0
#    match Amount:
#        case _ if Amount >= 9:
#            AmountDiscountToApply = 0.975
#        case _ if Amount >= 6:
#            AmountDiscountToApply = 0.985
#    AmountDiscount = Price * AmountDiscountToApply
#    TimePenaltyToApply = float
#    IntermediateTime = DeliveryDate - datetime.datetime.now().date()
#    match IntermediateTime:
#        case _ if IntermediateTime.days <= 28:
#            TimePenaltyToApply = 1.35
#        case _ if IntermediateTime.days > 28:
#            TimePenaltyToApply = 1.0
#    FinalPrice = AmountDiscount * TimePenaltyToApply
#    return FinalPrice * Amount
#Remove the above * Amount if we want the calculation to be per item.
