export default function Insights() {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">

      <h2 className="text-2xl font-bold mb-6">
        Energy Insights
      </h2>

      <div className="space-y-5">

        <div className="border rounded-xl p-4">
          <h3 className="font-semibold">
            Basement usage reduced by 62%
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            Compared to last month
          </p>
        </div>

        <div className="border rounded-xl p-4">
          <h3 className="font-semibold">
            Peak usage at 8:30 PM
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            Plan high usage efficiently
          </p>
        </div>

        <div className="border rounded-xl p-4">
          <h3 className="font-semibold">
            System performing efficiently
          </h3>

          <p className="text-sm text-gray-500 mt-1">
            All parameters are optimal
          </p>
        </div>

      </div>

    </div>
  );
}